export type TaskStatus = "backlog" | "doing" | "waiting" | "done";

export type UserRole = "design" | "strategy" | "development" | "pm" | "content_writer" | "agent" | "member";

export interface User {
  id: string;
  name: string;
  color: string;
  initials: string;
  email?: string;
  avatar_url?: string;
  role?: UserRole;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
}

export interface TaskSection {
  id: string;
  heading: string; // "Goal", "Scope", "Deliverables", etc.
  content: string; // supports line breaks
}

export const SECTION_PRESETS = [
  "Goal",
  "Scope",
  "Not Included",
  "Links",
  "Deliverables",
  "Done When",
  "Needs",
] as const;

export interface Task {
  id: string;
  title: string;
  client?: string;
  sections: TaskSection[];
  assignee_id: string;
  project_id?: string;
  status: TaskStatus;
  priority: number; // 1 = top priority
  due_at?: string;
  checkin_target_id?: string;
  created_by_id: string;
  created_via: "app_chat" | "manual" | "whatsapp" | "email" | "openclaw";
  drive_links: string[];
  notes: string[];
  sort_order?: number;
  email_draft_id?: string;
  source_email_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskUpdate {
  id: string;
  task_id: string;
  author_id?: string;
  source: "user" | "bot" | "system";
  body: string;
  status_signal?: "on_track" | "blocked" | "done";
  created_at: string;
}

export interface CheckIn {
  id: string;
  task_id: string;
  scheduled_for: string;
  sent_at?: string;
  responded_at?: string;
  response?: string;
  cancelled: boolean;
}

// ============================================
// Messaging Types
// ============================================

export type ChannelType = "public" | "private" | "direct";
export type MemberRole = "owner" | "admin" | "member";

export interface Channel {
  id: string;
  name: string | null;
  description: string | null;
  type: ChannelType;
  project_id: string | null;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Computed client-side
  members?: ChannelMember[];
  last_message?: Message | null;
  unread_count?: number;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: MemberRole;
  last_read_at: string;
  muted: boolean;
  joined_at: string;
  // Populated client-side
  user?: User;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string | null;
  body: string;
  reply_to: string | null;
  is_system: boolean;
  is_ai: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Populated client-side
  sender?: User;
  reactions?: MessageReaction[];
  reply_message?: Message | null;
  files?: FileAttachment[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// ============================================
// File Types
// ============================================

export interface FileAttachment {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  channel_id: string | null;
  message_id: string | null;
  task_id: string | null;
  project_id: string | null;
  created_at: string;
  // Computed client-side
  url?: string;
}

export interface FileUploadProgress {
  file: File;
  tempId: string;
  name: string;
  size: number;
  percent: number; // 0-100
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  attachment?: FileAttachment;
}

// ============================================
// Notification Types
// ============================================

export type NotificationType =
  | "task_assigned"
  | "task_updated"
  | "task_completed"
  | "mention"
  | "dm"
  | "channel_message"
  | "checkin_due"
  | "agent_report"
  | "email_ingested"
  | "email_triage";

export type NotificationChannel = "in_app" | "whatsapp" | "email" | "push";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  channel: NotificationChannel;
  delivered_at: string | null;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
}

// ============================================
// AI Summary Types
// ============================================

export interface Summary {
  id: string;
  source_type: "channel" | "project" | "task" | "email_thread";
  source_id: string;
  summary: string;
  key_points: string[];
  message_range_start: string | null;
  message_range_end: string | null;
  message_count: number | null;
  generated_by: string;
  created_at: string;
}

// ============================================
// Agent Activity Types
// ============================================

export interface AgentActivity {
  id: string;
  agent_name: string;
  action: string;
  description: string;
  source_email: string | null;
  task_id: string | null;
  project_id: string | null;
  channel_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Push Subscription Types
// ============================================

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

// ============================================
// User Preferences
// ============================================

export interface UserPreferences {
  user_id: string;
  whatsapp_number: string | null;
  whatsapp_enabled: boolean;
  email_notifications: boolean;
  notify_task_assigned: boolean;
  notify_mentions: boolean;
  notify_dm: boolean;
  notify_agent_reports: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  updated_at: string;
}

// ============================================
// Search Types
// ============================================

export interface SearchResult {
  type: "task" | "message" | "file" | "channel";
  id: string;
  title: string;
  snippet: string;
  created_at: string;
  channel_id?: string;
  task_id?: string;
  project_id?: string;
}

// ============================================
// Email Draft Types
// ============================================

export type EmailDraftStatus = "draft" | "approved" | "sent" | "failed";

export interface EmailDraft {
  id: string;
  channel_id: string | null;
  project_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  in_reply_to_message_id: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  status: EmailDraftStatus;
  generated_by: string;
  edited_by: string | null;
  sent_at: string | null;
  sent_gmail_id: string | null;
  error_message: string | null;
  triage_category: string | null;
  triage_reasoning: string | null;
  triage_confidence: number | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Project Context Types (knowledge base)
// ============================================

export type ProjectDocType =
  | "strategy_brief"
  | "brand_guidelines"
  | "decision_log"
  | "client_preferences"
  | "meeting_notes"
  | "agent_config";

export interface ProjectContext {
  id: string;
  project_id: string;
  doc_type: ProjectDocType;
  title: string;
  content: string;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// View & Navigation Types
// ============================================

export type ViewMode = "board" | "list" | "myday" | "messages";
export type FilterField = "assignee" | "project" | "status" | "due";

export type MessagesPanelView =
  | { kind: "list" }                                  // channel/DM list
  | { kind: "channel"; channelId: string }            // inside a channel
  | { kind: "new_dm"; userId?: string }               // start a new DM
  | { kind: "new_channel" };                          // create new channel
