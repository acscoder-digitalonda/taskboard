"use client";

import { Task, TaskStatus, Project, TaskSection, User } from "@/types";
import { supabase } from "./supabase";
import { deleteProjectFiles } from "./files";

type Listener = () => void;
type ErrorListener = (message: string) => void;

let tasks: Task[] = [];
let projects: Project[] = [];
let users: User[] = [];
let initialized = false;
let initializing = false;
const taskListeners: Set<Listener> = new Set();
const projectListeners: Set<Listener> = new Set();
const userListeners: Set<Listener> = new Set();

// C4: Error notification system for failed mutations
const errorListeners: Set<ErrorListener> = new Set();
export const storeErrorEmitter = {
  emit: (message: string) => {
    errorListeners.forEach((fn) => fn(message));
  },
  subscribe: (fn: ErrorListener) => {
    errorListeners.add(fn);
    return () => { errorListeners.delete(fn); };
  },
};

function emitTasks() {
  taskListeners.forEach((fn) => fn());
}

function emitProjects() {
  projectListeners.forEach((fn) => fn());
}

function emitUsers() {
  userListeners.forEach((fn) => fn());
}

const ACCENT_COLORS = [
  "#00BCD4", "#E91E63", "#FFD600", "#9C27B0", "#FF5722",
  "#4CAF50", "#2196F3", "#FF9800", "#795548", "#607D8B",
];

// ---- Supabase data fetching ----

async function fetchTasks(): Promise<Task[]> {
  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .order("sort_order", { ascending: true });

  if (taskError) {
    console.error("Error fetching tasks:", taskError);
    return tasks; // return current cache on error
  }

  const { data: sectionRows, error: secError } = await supabase
    .from("task_sections")
    .select("*")
    .order("sort_order", { ascending: true });

  if (secError) {
    console.error("Error fetching sections:", secError);
  }

  const sectionsByTask = new Map<string, TaskSection[]>();
  for (const s of sectionRows || []) {
    const arr = sectionsByTask.get(s.task_id) || [];
    arr.push({ id: s.id, heading: s.heading, content: s.content });
    sectionsByTask.set(s.task_id, arr);
  }

  return (taskRows || []).map((t) => ({
    id: t.id,
    title: t.title,
    client: t.client || undefined,
    sections: sectionsByTask.get(t.id) || [],
    assignee_id: t.assignee_id,
    project_id: t.project_id || undefined,
    status: t.status as TaskStatus,
    priority: t.priority,
    due_at: t.due_at || undefined,
    checkin_target_id: t.checkin_target_id || undefined,
    created_by_id: t.created_by_id,
    created_via: t.created_via,
    drive_links: t.drive_links || [],
    notes: t.notes || [],
    sort_order: t.sort_order || 0,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));
}

async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching projects:", error);
    return projects;
  }

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }));
}

async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching users:", error);
    return users;
  }

  return (data || []).map((u) => ({
    id: u.id,
    name: u.name,
    color: u.color,
    initials: u.initials,
    email: u.email,
    avatar_url: u.avatar_url,
  }));
}

// ---- Debounced refetch ----

let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedRefetch() {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(async () => {
    const [newTasks, newProjects, newUsers] = await Promise.all([fetchTasks(), fetchProjects(), fetchUsers()]);
    tasks = newTasks;
    projects = newProjects;
    users = newUsers;
    emitTasks();
    emitProjects();
    emitUsers();
  }, 100);
}

// ---- Realtime subscriptions ----

function setupRealtime() {
  supabase
    .channel("store-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => debouncedRefetch())
    .on("postgres_changes", { event: "*", schema: "public", table: "task_sections" }, () => debouncedRefetch())
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => debouncedRefetch())
    .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => debouncedRefetch())
    .subscribe();
}

// ---- Init ----

async function initStore() {
  if (initialized || initializing) return;
  initializing = true;

  try {
    const [fetchedTasks, fetchedProjects, fetchedUsers] = await Promise.all([fetchTasks(), fetchProjects(), fetchUsers()]);
    tasks = fetchedTasks;
    projects = fetchedProjects;
    users = fetchedUsers;
    initialized = true;

    emitTasks();
    emitProjects();
    emitUsers();
    setupRealtime();
  } catch (err) {
    console.error("Failed to initialize store:", err);
  } finally {
    initializing = false;
  }
}

// ---- Store API ----

export const store = {
  // --- Tasks ---
  getTasks: () => tasks,
  // H4: Expose initialized state for loading indicators
  getInitialized: () => initialized,

  subscribe: (fn: Listener) => {
    taskListeners.add(fn);
    initStore().catch((err) => console.error("Failed to init store:", err));
    return () => taskListeners.delete(fn);
  },

  addTask: (task: Omit<Task, "id" | "created_at" | "updated_at">) => {
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id: tempId,
      sort_order: task.sort_order ?? 0,
      created_at: now,
      updated_at: now,
    };
    tasks = [newTask, ...tasks];
    emitTasks();

    (async () => {
      // Insert task
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: newTask.title,
          client: newTask.client || null,
          assignee_id: newTask.assignee_id,
          project_id: newTask.project_id || null,
          status: newTask.status,
          priority: newTask.priority,
          due_at: newTask.due_at || null,
          checkin_target_id: newTask.checkin_target_id || null,
          created_by_id: newTask.created_by_id,
          created_via: newTask.created_via,
          drive_links: newTask.drive_links,
          notes: newTask.notes,
          sort_order: newTask.sort_order,
        })
        .select()
        .single();

      if (error) {
        console.error("Error inserting task:", error);
        tasks = tasks.filter((t) => t.id !== tempId);
        emitTasks();
        storeErrorEmitter.emit("Failed to create task");
        return;
      }

      // Replace temp ID with real ID
      tasks = tasks.map((t) => (t.id === tempId ? { ...t, id: data.id, created_at: data.created_at, updated_at: data.updated_at } : t));
      emitTasks();

      // Insert sections if any
      if (newTask.sections.length > 0) {
        const sectionInserts = newTask.sections.map((s, i) => ({
          task_id: data.id,
          heading: s.heading,
          content: s.content,
          sort_order: i,
        }));
        const { error: secError } = await supabase
          .from("task_sections")
          .insert(sectionInserts);
        if (secError) console.error("Error inserting sections:", secError);
      }
    })();

    return newTask;
  },

  updateTask: (id: string, updates: Partial<Task>) => {
    const prev = tasks.find((t) => t.id === id);
    tasks = tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    );
    emitTasks();

    (async () => {
      // Build DB-safe update (exclude sections, id, created_at)
      const { sections: _sections, id: _id, created_at: _ca, updated_at: _ua, ...dbUpdates } = updates;
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(dbUpdates)) {
        cleanUpdates[key] = value === undefined ? null : value;
      }

      if (Object.keys(cleanUpdates).length > 0) {
        const { error } = await supabase
          .from("tasks")
          .update(cleanUpdates)
          .eq("id", id);
        if (error) {
          console.error("Error updating task:", error);
          if (prev) {
            tasks = tasks.map((t) => (t.id === id ? prev : t));
            emitTasks();
          }
          storeErrorEmitter.emit("Failed to save task changes");
        }
      }
    })();
  },

  moveTask: (id: string, newStatus: TaskStatus) => {
    const prev = tasks.find((t) => t.id === id);
    tasks = tasks.map((t) =>
      t.id === id
        ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) {
        console.error("Error moving task:", error);
        if (prev) {
          tasks = tasks.map((t) => (t.id === id ? prev : t));
          emitTasks();
        }
        storeErrorEmitter.emit("Failed to move task");
      }
    })();
  },

  deleteTask: (id: string) => {
    const prev = tasks.find((t) => t.id === id);
    tasks = tasks.filter((t) => t.id !== id);
    emitTasks();

    (async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        console.error("Error deleting task:", error);
        if (prev) {
          tasks = [...tasks, prev];
          emitTasks();
        }
        storeErrorEmitter.emit("Failed to delete task");
      }
    })();
  },

  reorderTasks: (reordered: Task[]) => {
    tasks = reordered;
    emitTasks();

    (async () => {
      const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i }));
      // C3: Batch all updates in parallel instead of sequential awaits
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id)
        )
      );
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        console.error(`Error reordering tasks: ${errors.length} failures`, errors[0].error);
        storeErrorEmitter.emit("Failed to save task order");
      }
    })();
  },

  addNoteToTask: (taskId: string, note: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newNotes = [...task.notes, note];
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, notes: newNotes, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ notes: newNotes })
        .eq("id", taskId);
      if (error) console.error("Error adding note:", error);
    })();
  },

  removeNoteFromTask: (taskId: string, noteIndex: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newNotes = task.notes.filter((_: string, i: number) => i !== noteIndex);
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, notes: newNotes, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ notes: newNotes })
        .eq("id", taskId);
      if (error) console.error("Error removing note:", error);
    })();
  },

  addDriveLinkToTask: (taskId: string, link: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newLinks = [...task.drive_links, link];
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, drive_links: newLinks, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ drive_links: newLinks })
        .eq("id", taskId);
      if (error) console.error("Error adding drive link:", error);
    })();
  },

  removeDriveLinkFromTask: (taskId: string, linkIndex: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newLinks = task.drive_links.filter((_: string, i: number) => i !== linkIndex);
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, drive_links: newLinks, updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ drive_links: newLinks })
        .eq("id", taskId);
      if (error) console.error("Error removing drive link:", error);
    })();
  },

  // --- Sections ---
  addSectionToTask: (taskId: string, heading: string, content: string) => {
    const tempId = crypto.randomUUID();
    const section: TaskSection = { id: tempId, heading, content };
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, sections: [...t.sections, section], updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const task = tasks.find((t) => t.id === taskId);
      const sortOrder = task ? task.sections.length - 1 : 0;
      const { data, error } = await supabase
        .from("task_sections")
        .insert({ task_id: taskId, heading, content, sort_order: sortOrder })
        .select()
        .single();
      if (error) {
        console.error("Error adding section:", error);
        return;
      }
      // Replace temp ID
      tasks = tasks.map((t) =>
        t.id === taskId
          ? { ...t, sections: t.sections.map((s) => (s.id === tempId ? { ...s, id: data.id } : s)) }
          : t
      );
      emitTasks();
    })();
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

    (async () => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.heading !== undefined) dbUpdates.heading = updates.heading;
      if (updates.content !== undefined) dbUpdates.content = updates.content;
      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase
          .from("task_sections")
          .update(dbUpdates)
          .eq("id", sectionId);
        if (error) console.error("Error updating section:", error);
      }
    })();
  },

  removeSectionFromTask: (taskId: string, sectionId: string) => {
    tasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, sections: t.sections.filter((s) => s.id !== sectionId), updated_at: new Date().toISOString() }
        : t
    );
    emitTasks();

    (async () => {
      const { error } = await supabase
        .from("task_sections")
        .delete()
        .eq("id", sectionId);
      if (error) console.error("Error removing section:", error);
    })();
  },

  // --- Projects ---
  getProjects: () => projects,

  subscribeProjects: (fn: Listener) => {
    projectListeners.add(fn);
    initStore().catch((err) => console.error("Failed to init store:", err));
    return () => projectListeners.delete(fn);
  },

  addProject: (name: string, color?: string) => {
    const tempId = crypto.randomUUID();
    const newProject: Project = {
      id: tempId,
      name,
      color: color || ACCENT_COLORS[projects.length % ACCENT_COLORS.length],
    };
    projects = [...projects, newProject];
    emitProjects();

    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: newProject.name, color: newProject.color })
        .select()
        .single();
      if (error) {
        console.error("Error inserting project:", error);
        projects = projects.filter((p) => p.id !== tempId);
        emitProjects();
        storeErrorEmitter.emit("Failed to create project");
        return;
      }
      projects = projects.map((p) => (p.id === tempId ? { ...p, id: data.id } : p));
      emitProjects();
    })();

    return newProject;
  },

  updateProject: (id: string, updates: Partial<Project>) => {
    const prev = projects.find((p) => p.id === id);
    projects = projects.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    emitProjects();

    (async () => {
      const { id: _id, ...dbUpdates } = updates;
      const { error } = await supabase
        .from("projects")
        .update(dbUpdates)
        .eq("id", id);
      if (error) {
        console.error("Error updating project:", error);
        if (prev) {
          projects = projects.map((p) => (p.id === id ? prev : p));
          emitProjects();
        }
        storeErrorEmitter.emit("Failed to update project");
      }
    })();
  },

  // --- Users ---
  getUsers: () => users,

  subscribeUsers: (fn: Listener) => {
    userListeners.add(fn);
    initStore().catch((err) => console.error("Failed to init store:", err));
    return () => userListeners.delete(fn);
  },

  deleteProject: (id: string) => {
    const prevProjects = [...projects];
    const prevTasks = [...tasks];
    projects = projects.filter((p) => p.id !== id);
    tasks = tasks.map((t) =>
      t.project_id === id ? { ...t, project_id: undefined } : t
    );
    emitProjects();
    emitTasks();

    (async () => {
      // Delete all files belonging to this project from storage + DB
      try {
        const deletedCount = await deleteProjectFiles(id);
        if (deletedCount > 0) console.log(`Cleaned up ${deletedCount} project files`);
      } catch (err) {
        console.error("Error cleaning up project files:", err);
      }

      // Clear project_id on associated tasks
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ project_id: null })
        .eq("project_id", id);
      if (taskError) console.error("Error clearing project from tasks:", taskError);

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Error deleting project:", error);
        projects = prevProjects;
        tasks = prevTasks;
        emitProjects();
        emitTasks();
        storeErrorEmitter.emit("Failed to delete project");
      }
    })();
  },
};

// Parse natural language task input
export function parseTaskInput(input: string): Partial<Task> {
  const text = input.trim();
  const result: Partial<Task> = { title: text };

  const assignMatch = text.match(/(?:assign(?:ed)?\s+to\s+|@)(\w+)/i);
  if (assignMatch) {
    const name = assignMatch[1].toLowerCase();
    const user = users.find((u) => u.name.toLowerCase() === name);
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

  // H5: Validate title is non-empty after stripping parsed patterns
  if (!result.title) {
    result.title = text; // Fall back to original input
  }

  return result;
}
