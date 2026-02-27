import { createServerSupabase } from "@/lib/api-auth";

const BUCKET = "files";
const APP_PREFIX = "taskboard";
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Server-side file upload from a URL (for processing email attachments).
 *
 * Downloads the file from the given URL, uploads to Supabase Storage,
 * and creates a record in the files table.
 */
export async function uploadFileFromUrl(
  url: string,
  options: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    projectId?: string;
    channelId?: string;
    messageId?: string;
    taskId?: string;
  }
): Promise<{ id: string; storage_path: string } | null> {
  const supabase = createServerSupabase();
  const timestamp = Date.now();
  const safeName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Build storage path
  let storagePath: string;
  if (options.projectId) {
    storagePath = `${APP_PREFIX}/projects/${options.projectId}/email-attachments/${timestamp}-${safeName}`;
  } else {
    storagePath = `${APP_PREFIX}/email-attachments/${timestamp}-${safeName}`;
  }

  try {
    // Fetch the file content
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download attachment from ${url}: ${response.status}`);
      return null;
    }

    // Guard against oversized downloads
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
      console.error(`Attachment too large (${contentLength} bytes, max ${MAX_DOWNLOAD_SIZE}): ${url}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_DOWNLOAD_SIZE) {
      console.error(`Downloaded file exceeds size limit (${buffer.byteLength} bytes): ${url}`);
      return null;
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: options.mimeType || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading email attachment:", uploadError);
      return null;
    }

    // Create record in files table
    const { data, error: dbError } = await supabase
      .from("files")
      .insert({
        name: options.fileName,
        storage_path: storagePath,
        mime_type: options.mimeType || null,
        size_bytes: options.sizeBytes || buffer.byteLength,
        uploaded_by: null, // System upload (from email)
        channel_id: options.channelId || null,
        message_id: options.messageId || null,
        task_id: options.taskId || null,
        project_id: options.projectId || null,
      })
      .select("id, storage_path")
      .single();

    if (dbError || !data) {
      console.error("Error creating file record for attachment:", dbError);
      // Clean up orphaned storage file
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return null;
    }

    return { id: data.id, storage_path: data.storage_path };
  } catch (error) {
    console.error("Error processing email attachment:", error);
    return null;
  }
}

/**
 * Server-side file upload from a raw buffer (for API-submitted files).
 *
 * Uploads the buffer to Supabase Storage and creates a record in the
 * files table linked to the given task.
 */
export async function uploadFileFromBuffer(
  buffer: ArrayBuffer,
  options: {
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
    projectId?: string;
    taskId?: string;
  }
): Promise<{ id: string; storage_path: string } | null> {
  const supabase = createServerSupabase();
  const timestamp = Date.now();
  const safeName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Build storage path — organize under task if available
  let storagePath: string;
  if (options.projectId && options.taskId) {
    storagePath = `${APP_PREFIX}/projects/${options.projectId}/tasks/${options.taskId}/${timestamp}-${safeName}`;
  } else if (options.projectId) {
    storagePath = `${APP_PREFIX}/projects/${options.projectId}/general/${timestamp}-${safeName}`;
  } else if (options.taskId) {
    storagePath = `${APP_PREFIX}/tasks/${options.taskId}/${timestamp}-${safeName}`;
  } else {
    storagePath = `${APP_PREFIX}/uploads/${timestamp}-${safeName}`;
  }

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: options.mimeType || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file from buffer:", uploadError);
      return null;
    }

    // Create record in files table
    const { data, error: dbError } = await supabase
      .from("files")
      .insert({
        name: options.fileName,
        storage_path: storagePath,
        mime_type: options.mimeType || null,
        size_bytes: options.sizeBytes || buffer.byteLength,
        uploaded_by: null, // API upload
        task_id: options.taskId || null,
        project_id: options.projectId || null,
      })
      .select("id, storage_path")
      .single();

    if (dbError || !data) {
      console.error("Error creating file record:", dbError);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return null;
    }

    return { id: data.id, storage_path: data.storage_path };
  } catch (error) {
    console.error("Error uploading file from buffer:", error);
    return null;
  }
}

/**
 * Link existing file records to a task (used after triage creates a task
 * from an email that had attachments).
 */
export async function linkFilesToTask(
  fileIds: string[],
  taskId: string
): Promise<void> {
  if (!fileIds.length) return;

  const supabase = createServerSupabase();

  for (const fileId of fileIds) {
    await supabase
      .from("files")
      .update({ task_id: taskId })
      .eq("id", fileId);
  }
}

/**
 * Format file size for display in messages.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
