import { USERS } from "./data";
import { store } from "./store";

export function getUserById(id: string) {
  return USERS.find((u) => u.id === id);
}

export function getProjectById(id: string | undefined) {
  if (!id) return undefined;
  return store.getProjects().find((p) => p.id === id);
}

export function formatDue(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffHours < 0) {
    if (diffDays === 0 || diffDays === -1) return "Overdue";
    return `${Math.abs(diffDays)}d overdue`;
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
