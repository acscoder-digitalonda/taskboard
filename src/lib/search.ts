"use client";

import { SearchResult } from "@/types";
import { supabase } from "./supabase";

// H6: Escape LIKE wildcard characters in user input
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Unified search across tasks, messages, files, and channels.
 * Uses Postgres full-text search (tsvector) for performance.
 */
export async function searchEverything(
  query: string,
  options?: {
    types?: ("task" | "message" | "file" | "channel")[];
    projectId?: string;
    limit?: number;
  }
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const limit = options?.limit || 20;
  const types = options?.types || ["task", "message", "file", "channel"];

  // Build the tsquery from user input
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .map((word) => `${word}:*`)
    .join(" & ");

  const searches: Promise<void>[] = [];

  // Search tasks
  if (types.includes("task")) {
    searches.push(
      (async () => {
        let q = supabase
          .from("tasks")
          .select("id, title, client, notes, created_at, project_id")
          .textSearch("search_vector", tsQuery)
          .limit(limit);

        if (options?.projectId) {
          q = q.eq("project_id", options.projectId);
        }

        const { data } = await q;
        for (const t of data || []) {
          results.push({
            type: "task",
            id: t.id,
            title: t.title,
            snippet: t.client ? `Client: ${t.client}` : (t.notes?.[0] || ""),
            created_at: t.created_at,
            project_id: t.project_id,
          });
        }
      })()
    );
  }

  // Search messages
  if (types.includes("message")) {
    searches.push(
      (async () => {
        const { data } = await supabase
          .from("messages")
          .select("id, body, channel_id, created_at")
          .textSearch("search_vector", tsQuery)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(limit);

        for (const m of data || []) {
          results.push({
            type: "message",
            id: m.id,
            title: m.body.length > 80 ? m.body.slice(0, 80) + "..." : m.body,
            snippet: m.body,
            created_at: m.created_at,
            channel_id: m.channel_id,
          });
        }
      })()
    );
  }

  // Search files
  if (types.includes("file")) {
    searches.push(
      (async () => {
        const { data } = await supabase
          .from("files")
          .select("id, name, channel_id, task_id, project_id, created_at, mime_type, size_bytes")
          .textSearch("search_vector", tsQuery)
          .limit(limit);

        for (const f of data || []) {
          const sizeStr = f.size_bytes
            ? f.size_bytes > 1048576
              ? `${(f.size_bytes / 1048576).toFixed(1)} MB`
              : `${(f.size_bytes / 1024).toFixed(0)} KB`
            : "";
          results.push({
            type: "file",
            id: f.id,
            title: f.name,
            snippet: `${f.mime_type || "file"} ${sizeStr}`.trim(),
            created_at: f.created_at,
            channel_id: f.channel_id,
            task_id: f.task_id,
            project_id: f.project_id,
          });
        }
      })()
    );
  }

  // Search channels by name
  if (types.includes("channel")) {
    searches.push(
      (async () => {
        const { data } = await supabase
          .from("channels")
          .select("id, name, description, type, project_id, created_at")
          .ilike("name", `%${escapeLikePattern(query)}%`)
          .eq("is_archived", false)
          .limit(limit);

        for (const ch of data || []) {
          results.push({
            type: "channel",
            id: ch.id,
            title: ch.name || "Direct Message",
            snippet: ch.description || ch.type,
            created_at: ch.created_at,
            project_id: ch.project_id,
          });
        }
      })()
    );
  }

  await Promise.all(searches);

  // Sort by relevance (recency as proxy)
  results.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return results.slice(0, limit);
}

/**
 * Search within a single channel's messages
 */
export async function searchInChannel(
  channelId: string,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .map((word) => `${word}:*`)
    .join(" & ");

  const { data } = await supabase
    .from("messages")
    .select("id, body, channel_id, created_at")
    .eq("channel_id", channelId)
    .textSearch("search_vector", tsQuery)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).map((m) => ({
    type: "message" as const,
    id: m.id,
    title: m.body.length > 80 ? m.body.slice(0, 80) + "..." : m.body,
    snippet: m.body,
    created_at: m.created_at,
    channel_id: m.channel_id,
  }));
}
