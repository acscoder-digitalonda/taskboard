import type { User, Project } from "../types";

export function getUserById(users: User[], id: string) {
  return users.find((u) => u.id === id);
}

export function getProjectById(projects: Project[], id: string | undefined) {
  if (!id) return undefined;
  return projects.find((p) => p.id === id);
}

export function formatDue(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  // L4: Use floor instead of round to prevent misleading rounding (e.g. 29min → "1h")
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 0) {
    const overdueDays = Math.ceil(Math.abs(diffMs) / 86400000);
    if (overdueDays <= 1) return "Overdue";
    return `${overdueDays}d overdue`;
  }
  if (diffHours < 1) return "< 1h";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isDueToday(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function isOverdue(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
};

export const STATUS_COLORS: Record<string, string> = {
  backlog: "#9E9E9E",
  doing: "#00BCD4",
  waiting: "#FFD600",
  done: "#4CAF50",
};

// L7: Shared accent color palette (used by store, auth, ProjectManager)
export const ACCENT_COLORS = [
  "#00BCD4", "#E91E63", "#FFD600", "#9C27B0", "#FF5722",
  "#4CAF50", "#2196F3", "#FF9800", "#795548", "#607D8B",
];
