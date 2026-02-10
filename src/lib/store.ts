"use client";

import { Task, TaskStatus, Project, TaskSection } from "@/types";
import { INITIAL_TASKS, USERS, INITIAL_PROJECTS } from "./data";

type Listener = () => void;

let tasks: Task[] = [...INITIAL_TASKS];
let projects: Project[] = [...INITIAL_PROJECTS];
const taskListeners: Set<Listener> = new Set();
const projectListeners: Set<Listener> = new Set();

function emitTasks() {
  taskListeners.forEach((fn) => fn());
}

function emitProjects() {
  projectListeners.forEach((fn) => fn());
}

const ACCENT_COLORS = [
  "#00BCD4", "#E91E63", "#FFD600", "#9C27B0", "#FF5722",
  "#4CAF50", "#2196F3", "#FF9800", "#795548", "#607D8B",
];

export const store = {
  // --- Tasks ---
  getTasks: () => tasks,

  subscribe: (fn: Listener) => {
    taskListeners.add(fn);
    return () => taskListeners.delete(fn);
  },

  addTask: (task: Omit<Task, "id" | "created_at" | "updated_at">) => {
    const newTask: Task = {
      ...task,
      id: "t" + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tasks = [newTask, ...tasks];
    emitTasks();
    return newTask;
  },

  updateTask: (id: string, updates: Partial<Task>) => {
    tasks = tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    );
    emitTasks();
  },

  moveTask: (id: string, newStatus: TaskStatus) => {
    tasks = tasks.map((t) =>
      t.id === id
        ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  deleteTask: (id: string) => {
    tasks = tasks.filter((t) => t.id !== id);
    emitTasks();
  },

  reorderTasks: (reordered: Task[]) => {
    tasks = reordered;
    emitTasks();
  },

  addNoteToTask: (taskId: string, note: string) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, notes: [...t.notes, note], updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  removeNoteFromTask: (taskId: string, noteIndex: number) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, notes: t.notes.filter((_: string, i: number) => i !== noteIndex), updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  addDriveLinkToTask: (taskId: string, link: string) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, drive_links: [...t.drive_links, link], updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  removeDriveLinkFromTask: (taskId: string, linkIndex: number) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, drive_links: t.drive_links.filter((_: string, i: number) => i !== linkIndex), updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  // --- Sections ---
  addSectionToTask: (taskId: string, heading: string, content: string) => {
    const section: TaskSection = { id: "s" + Date.now(), heading, content };
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, sections: [...t.sections, section], updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  updateSectionInTask: (taskId: string, sectionId: string, updates: Partial<TaskSection>) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            sections: t.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
            updated_at: new Date().toISOString(),
          }
        : t
    );
    emitTasks();
  },

  removeSectionFromTask: (taskId: string, sectionId: string) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, sections: t.sections.filter((s) => s.id !== sectionId), updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();
  },

  // --- Projects ---
  getProjects: () => projects,

  subscribeProjects: (fn: Listener) => {
    projectListeners.add(fn);
    return () => projectListeners.delete(fn);
  },

  addProject: (name: string, color?: string) => {
    const newProject: Project = {
      id: "p" + Date.now(),
      name,
      color: color || ACCENT_COLORS[projects.length % ACCENT_COLORS.length],
    };
    projects = [...projects, newProject];
    emitProjects();
    return newProject;
  },

  updateProject: (id: string, updates: Partial<Project>) => {
    projects = projects.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    emitProjects();
  },

  deleteProject: (id: string) => {
    projects = projects.filter((p) => p.id !== id);
    tasks = tasks.map((t) =>
      t.project_id === id ? { ...t, project_id: undefined } : t
    );
    emitProjects();
    emitTasks();
  },
};

// Parse natural language task input
export function parseTaskInput(input: string): Partial<Task> {
  const text = input.trim();
  const result: Partial<Task> = { title: text };

  const assignMatch = text.match(/(?:assign(?:ed)?\s+to\s+|@)(\w+)/i);
  if (assignMatch) {
    const name = assignMatch[1].toLowerCase();
    const user = USERS.find((u) => u.name.toLowerCase() === name);
    if (user) {
      result.assignee_id = user.id;
      result.title = text.replace(assignMatch[0], "").trim();
    }
  }

  const projMatch = text.match(/project[:\s]+(\w+)/i);
  if (projMatch) {
    const projName = projMatch[1].toLowerCase();
    const proj = projects.find((p) => p.name.toLowerCase() === projName);
    if (proj) {
      result.project_id = proj.id;
      result.title = (result.title || "").replace(projMatch[0], "").trim();
    }
  }

  const dueMatch = text.match(/due\s+(today|tomorrow|in\s+(\d+)\s+days?)/i);
  if (dueMatch) {
    const now = new Date();
    if (dueMatch[1].toLowerCase() === "today") {
      now.setHours(17, 0, 0, 0);
      result.due_at = now.toISOString();
    } else if (dueMatch[1].toLowerCase() === "tomorrow") {
      now.setDate(now.getDate() + 1);
      now.setHours(17, 0, 0, 0);
      result.due_at = now.toISOString();
    } else if (dueMatch[2]) {
      now.setDate(now.getDate() + parseInt(dueMatch[2]));
      now.setHours(17, 0, 0, 0);
      result.due_at = now.toISOString();
    }
    result.title = (result.title || "").replace(dueMatch[0], "").trim();
  }

  result.title = (result.title || "")
    .replace(/,\s*$/, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  return result;
}
