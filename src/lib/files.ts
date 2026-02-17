"use client";

import { FileAttachment } from "@/types";
import { supabase } from "./supabase";

const BUCKET = "files";
const APP_PREFIX = "taskboard";

// ── Path Construction ──────────────────────────────────────────

/**
 * Build a project-organized, app-namespaced storage path.
 *
 * With project:  taskboard/projects/{projectId}/{context}/{timestamp}-{name}
 * Without:       taskboard/unassigned/{userId}/{timestamp}-{name}
 */
function buildStoragePath(options: {
  uploadedBy: string;
  fileName: string;
  projectId?: string;
  taskId?: string;
  channelId?: string;
}): string {
  const timestamp = Date.now();
  const safeName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (options.projectId) {
    let context = "general";
    if (options.taskId) context = `tasks/${options.taskId}`;
    else if (options.channelId) context = `channels/${options.channelId}`;
    return `${APP_PREFIX}/projects/${options.projectId}/${context}/${timestamp}-${safeName}`;
  }

  return `${APP_PREFIX}/unassigned/${options.uploadedBy}/${timestamp}-${safeName}`;
}

// ── Signed URL helper ──────────────────────────────────────────

/**
 * Attach a signed URL to a file record (private bucket).
 * Falls back to storage_path if signing fails.
 */
async function attachSignedUrl(f: FileAttachment): Promise<FileAttachment> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(f.storage_path, 3600);
  return { ...f, url: data?.signedUrl || undefined };
}

/**
 * Map raw DB rows to FileAttachment[] with signed URLs.
 */
async function mapWithUrls(
  rows: Array<Record<string, unknown>>
): Promise<FileAttachment[]> {
  if (!rows.length) return [];

  // Batch-sign all URLs at once
  const paths = rows.map((r) => r.storage_path as string);
  const { data: signedBatch } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 3600);

  return rows.map((f, i) => ({
    id: f.id as string,
    name: f.name as string,
    storage_path: f.storage_path as string,
    mime_type: (f.mime_type as string) || null,
    size_bytes: (f.size_bytes as number) || null,
    uploaded_by: (f.uploaded_by as string) || null,
    channel_id: (f.channel_id as string) || null,
    message_id: (f.message_id as string) || null,
    task_id: (f.task_id as string) || null,
    project_id: (f.project_id as string) || null,
    created_at: f.created_at as string,
    url: signedBatch?.[i]?.signedUrl || undefined,
  }));
}

// ── Upload ─────────────────────────────────────────────────────

/**
 * Upload a file to Supabase Storage and create a record in the files table.
 *
 * Files are stored under project-organized, app-namespaced paths:
 *   taskboard/projects/{projectId}/tasks/{taskId}/{ts}-{name}
 *   taskboard/projects/{projectId}/channels/{channelId}/{ts}-{name}
 *   taskboard/projects/{projectId}/general/{ts}-{name}
 *   taskboard/unassigned/{userId}/{ts}-{name}
 */
export async function uploadFile(
  file: File,
  options: {
    uploadedBy: string;
    channelId?: string;
    messageId?: string;
    taskId?: string;
    projectId?: string;
  }
): Promise<FileAttachment | null> {
  const storagePath = buildStoragePath({
    uploadedBy: options.uploadedBy,
    fileName: file.name,
    projectId: options.projectId,
    taskId: options.taskId,
    channelId: options.channelId,
  });

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Error uploading file:", uploadError);
    return null;
  }

  // Create record in files table
  const { data, error: dbError } = await supabase
    .from("files")
    .insert({
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: options.uploadedBy,
      channel_id: options.channelId || null,
      message_id: options.messageId || null,
      task_id: options.taskId || null,
      project_id: options.projectId || null,
    })
    .select()
    .single();

  if (dbError || !data) {
    console.error("Error creating file record:", dbError);
    // Clean up orphaned storage file
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return null;
  }

  return attachSignedUrl({
    id: data.id,
    name: data.name,
    storage_path: data.storage_path,
    mime_type: data.mime_type,
    size_bytes: data.size_bytes,
    uploaded_by: data.uploaded_by,
    channel_id: data.channel_id,
    message_id: data.message_id,
    task_id: data.task_id,
    project_id: data.project_id,
    created_at: data.created_at,
  });
}

// ── Download URL ───────────────────────────────────────────────

/**
 * Get a signed URL for a private file (1-hour expiry).
 */
export async function getFileUrl(
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }

  return data?.signedUrl || null;
}

// ── List files ─────────────────────────────────────────────────

/**
 * List files attached to a task.
 */
export async function getTaskFiles(
  taskId: string
): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching task files:", error);
    return [];
  }

  return mapWithUrls(data || []);
}

/**
 * List files in a channel.
 */
export async function getChannelFiles(
  channelId: string
): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching channel files:", error);
    return [];
  }

  return mapWithUrls(data || []);
}

/**
 * List ALL files in a project (across tasks, channels, and general).
 */
export async function getProjectFiles(
  projectId: string
): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching project files:", error);
    return [];
  }

  return mapWithUrls(data || []);
}

/**
 * List project files grouped by context: tasks, channels, general.
 */
export async function getProjectFilesGrouped(projectId: string): Promise<{
  tasks: FileAttachment[];
  channels: FileAttachment[];
  general: FileAttachment[];
  total: number;
  totalBytes: number;
}> {
  const files = await getProjectFiles(projectId);
  const tasks = files.filter((f) => f.task_id);
  const channels = files.filter((f) => f.channel_id && !f.task_id);
  const general = files.filter((f) => !f.task_id && !f.channel_id);
  const totalBytes = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

  return { tasks, channels, general, total: files.length, totalBytes };
}

// ── Delete ─────────────────────────────────────────────────────

/**
 * Delete a single file from storage and the database.
 */
export async function deleteFile(
  fileId: string,
  storagePath: string
): Promise<boolean> {
  // Remove from storage
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (storageError) {
    console.error("Error deleting from storage:", storageError);
    // Continue to delete DB record even if storage fails
  }

  // Delete DB record
  const { error: dbError } = await supabase
    .from("files")
    .delete()
    .eq("id", fileId);

  if (dbError) {
    console.error("Error deleting file record:", dbError);
    return false;
  }

  return true;
}

/**
 * Delete multiple files by ID (bulk operation).
 */
export async function deleteFiles(
  files: Array<{ id: string; storage_path: string }>
): Promise<number> {
  if (!files.length) return 0;

  // Batch remove from storage
  const paths = files.map((f) => f.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);

  // Batch delete from DB
  const ids = files.map((f) => f.id);
  const { error } = await supabase
    .from("files")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("Error bulk deleting file records:", error);
    return 0;
  }

  return files.length;
}

/**
 * Delete ALL files belonging to a project (used on project deletion).
 */
export async function deleteProjectFiles(
  projectId: string
): Promise<number> {
  // Fetch all file paths for this project
  const { data: files } = await supabase
    .from("files")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (!files?.length) return 0;

  // Remove from storage
  const paths = files.map((f) => f.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);

  // Delete all DB records
  await supabase.from("files").delete().eq("project_id", projectId);

  return files.length;
}

// ── Utilities ──────────────────────────────────────────────────

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * Get a lucide-react icon name based on MIME type.
 */
export function getFileIconName(
  mimeType: string | null
): string {
  if (!mimeType) return "File";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Music";
  if (mimeType.includes("pdf")) return "FileText";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "Sheet";
  if (mimeType.includes("document") || mimeType.includes("word"))
    return "FileText";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "Presentation";
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive"))
    return "Archive";
  if (mimeType.includes("text/") || mimeType.includes("json") || mimeType.includes("xml"))
    return "FileCode";
  return "File";
}

/**
 * Get relative time string (e.g. "2h ago", "Yesterday", "Jan 15").
 */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Maximum file size constants.
 */
export const MAX_FILE_SIZE_MB = 500;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const HARD_LIMIT_MB = 2048; // 2 GB — suggest external link above this
export const HARD_LIMIT_BYTES = HARD_LIMIT_MB * 1024 * 1024;
