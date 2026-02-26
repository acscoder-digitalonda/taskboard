import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";
import { parseTaskWithLLM } from "@/lib/task-parser";
import { uploadFileFromBuffer, uploadFileFromUrl } from "@/lib/files-server";

/**
 * Image attachment — either a URL to download or inline base64 data.
 */
interface ImageInput {
  /** URL to download the image from */
  url?: string;
  /** Base64-encoded image data (without data: prefix) */
  data?: string;
  /** File name (required for base64, optional for URL — defaults to URL filename) */
  name?: string;
  /** MIME type (e.g. "image/png"). Auto-detected from URL or defaults to image/jpeg */
  mime_type?: string;
}

/**
 * POST /api/v1/tasks/assign
 *
 * Accept natural language text, use Claude to parse it into a structured
 * task, then create the task in the database.
 *
 * Auth: X-API-Key header
 *
 * Request body:
 *   {
 *     text: string,
 *     images?: Array<{
 *       url?: string,          // URL to download image from
 *       data?: string,         // OR base64-encoded image data
 *       name?: string,         // filename (auto-detected from URL if omitted)
 *       mime_type?: string     // e.g. "image/png" (auto-detected if omitted)
 *     }>
 *   }
 *
 * Response: { success: true, task: { ... }, files?: [...] }
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const body = await req.json();
    const { text, images } = body as { text?: string; images?: ImageInput[] };

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "\"text\" field is required and must be a string." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Fetch users (with roles/descriptions for smart assignment) and projects
    const [usersResult, projectsResult] = await Promise.all([
      supabase.from("users").select("id, name, role, description").neq("role", "agent"),
      supabase.from("projects").select("id, name"),
    ]);

    const users = (usersResult.data || []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role || undefined,
      description: u.description || undefined,
    }));

    const projects = (projectsResult.data || []).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    // Parse natural language with Claude
    const parsed = await parseTaskWithLLM(text, users, projects);

    // Determine created_by_id — use the first non-agent user as the API creator
    // (In the future this could be a dedicated API system user)
    let createdById = users[0]?.id;
    if (!createdById) {
      // Fallback: try to get any user
      const { data: anyUser } = await supabase
        .from("users")
        .select("id")
        .limit(1)
        .single();
      createdById = anyUser?.id || "system";
    }

    // If no assignee was parsed, default to the first user
    const assigneeId = parsed.assignee_id || users[0]?.id || createdById;

    // Insert the task
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        title: parsed.title,
        assignee_id: assigneeId,
        project_id: parsed.project_id || null,
        status: parsed.status || "doing",
        priority: parsed.priority || 3,
        due_at: parsed.due_at || null,
        created_by_id: createdById,
        created_via: "openclaw",
        drive_links: [],
        notes: [],
        sort_order: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating task:", insertError);
      return NextResponse.json(
        { error: "Failed to create task: " + insertError.message },
        { status: 500 }
      );
    }

    // ── Upload attached images ─────────────────────────────────────
    const uploadedFiles: Array<{ id: string; name: string; storage_path: string }> = [];

    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        try {
          if (img.url) {
            // Download from URL and upload
            const urlFileName =
              img.name ||
              decodeURIComponent(img.url.split("/").pop()?.split("?")[0] || `image-${Date.now()}.jpg`);
            const mimeType = img.mime_type || guessMimeType(urlFileName);

            const result = await uploadFileFromUrl(img.url, {
              fileName: urlFileName,
              mimeType,
              sizeBytes: 0, // will be determined from download
              projectId: task.project_id || undefined,
              taskId: task.id,
            });

            if (result) {
              uploadedFiles.push({ id: result.id, name: urlFileName, storage_path: result.storage_path });
            } else {
              console.warn(`[Assign] Failed to upload image from URL: ${img.url}`);
            }
          } else if (img.data) {
            // Decode base64 and upload
            const fileName = img.name || `image-${Date.now()}.jpg`;
            const mimeType = img.mime_type || guessMimeType(fileName);

            // Strip data URI prefix if present (e.g. "data:image/png;base64,")
            const base64Data = img.data.includes(",") ? img.data.split(",")[1] : img.data;
            const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)).buffer;

            const result = await uploadFileFromBuffer(buffer, {
              fileName,
              mimeType,
              sizeBytes: buffer.byteLength,
              projectId: task.project_id || undefined,
              taskId: task.id,
            });

            if (result) {
              uploadedFiles.push({ id: result.id, name: fileName, storage_path: result.storage_path });
            } else {
              console.warn(`[Assign] Failed to upload base64 image: ${fileName}`);
            }
          }
        } catch (imgErr) {
          console.error("[Assign] Image upload error:", imgErr);
          // Continue with remaining images — don't fail the whole request
        }
      }

      console.log(`[Assign] Uploaded ${uploadedFiles.length}/${images.length} images for task ${task.id}`);
    }

    // Notify the assignee
    if (task.assignee_id) {
      try {
        await fetch(`${req.nextUrl.origin}/api/notifications/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            user_id: task.assignee_id,
            type: "task_assigned",
            title: `New task: ${task.title}`,
            body: uploadedFiles.length > 0
              ? `Created via API · ${uploadedFiles.length} attachment${uploadedFiles.length > 1 ? "s" : ""}`
              : "Created via external API",
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: task.priority,
          }),
        });
      } catch (notifErr) {
        console.error("Failed to send task assignment notification:", notifErr);
      }
    }

    // Look up names for the response
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        assignee_id: task.assignee_id,
        assignee_name: userMap.get(task.assignee_id) || null,
        project_id: task.project_id,
        project_name: task.project_id
          ? projectMap.get(task.project_id) || null
          : null,
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        confidence: parsed.confidence,
        created_via: task.created_via,
        created_at: task.created_at,
      },
      ...(uploadedFiles.length > 0 && {
        files: uploadedFiles.map((f) => ({
          id: f.id,
          name: f.name,
          storage_path: f.storage_path,
        })),
      }),
    });
  } catch (error) {
    console.error("Task assign API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * Guess MIME type from file extension.
 */
function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };
  return map[ext || ""] || "image/jpeg";
}
