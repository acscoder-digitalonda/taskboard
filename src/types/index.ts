export type TaskStatus = "backlog" | "doing" | "waiting" | "done";

export interface User {
  id: string;
  name: string;
  color: string;
  initials: string;
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
  created_via: "app_chat" | "manual";
  drive_links: string[];
  notes: string[];
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

export type ViewMode = "board" | "list" | "myday";
export type FilterField = "assignee" | "project" | "status" | "due";
