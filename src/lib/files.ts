"use client";

import { FileAttachment } from "@/types";
import { supabase } from "./supabase";

const BUCKET = "files";

/**
 * Upload a file to Supabase Storage and create a record in the files table.
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
  // Generate unique storage path
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${options.uploadedBy}/${timestamp}-${safeName}`;

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
    return null;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return {
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
    url: urlData?.publicUrl,
  };
}

/**
 * Get a signed URL for a private file
 */
export async function getFileUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

  if (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }

  return data?.signedUrl || null;
}

/**
 * List files attached to a task
 */
export async function getTaskFiles(taskId: string): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching task files:", error);
    return [];
  }

  return (data || []).map((f) => {
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(f.storage_path);
    return {
      id: f.id,
      name: f.name,
      storage_path: f.storage_path,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      uploaded_by: f.uploaded_by,
      channel_id: f.channel_id,
      message_id: f.message_id,
      task_id: f.task_id,
      project_id: f.project_id,
      created_at: f.created_at,
      url: urlData?.publicUrl,
    };
  });
}

/**
 * List files in a channel
 */
export async function getChannelFiles(channelId: string): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching channel files:", error);
    return [];
  }

  return (data || []).map((f) => {
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(f.storage_path);
    return {
      id: f.id,
      name: f.name,
      storage_path: f.storage_path,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      uploaded_by: f.uploaded_by,
      channel_id: f.channel_id,
      message_id: f.message_id,
      task_id: f.task_id,
      project_id: f.project_id,
      created_at: f.created_at,
      url: urlData?.publicUrl,
    };
  });
}

/**
 * List files in a project
 */
export async function getProjectFiles(projectId: string): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching project files:", error);
    return [];
  }

  return (data || []).map((f) => {
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(f.storage_path);
    return {
      id: f.id,
      name: f.name,
      storage_path: f.storage_path,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      uploaded_by: f.uploaded_by,
      channel_id: f.channel_id,
      message_id: f.message_id,
      task_id: f.task_id,
      project_id: f.project_id,
      created_at: f.created_at,
      url: urlData?.publicUrl,
    };
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
