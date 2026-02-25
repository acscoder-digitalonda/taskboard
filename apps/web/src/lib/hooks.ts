"use client";

import { useSyncExternalStore, useCallback, useState, useMemo } from "react";
import { store } from "./store";
import { Task, TaskStatus } from "@/types";

export function useTasks() {
  const tasks = useSyncExternalStore(store.subscribe, store.getTasks, store.getTasks);
  // H4: Expose loading state so views can distinguish "loading" from "empty"
  const initialized = useSyncExternalStore(store.subscribe, store.getInitialized, store.getInitialized);
  return {
    tasks,
    loading: !initialized,
    addTask: store.addTask,
    updateTask: store.updateTask,
    moveTask: store.moveTask,
    deleteTask: store.deleteTask,
    reorderTasks: store.reorderTasks,
  };
}

export function useTasksByStatus(status: TaskStatus) {
  const { tasks } = useTasks();
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => a.priority - b.priority);
}

export function useMyDayTasks(userId: string) {
  const { tasks } = useTasks();
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const myTasks = tasks
    .filter(
      (t) =>
        t.assignee_id === userId &&
        t.status !== "done" &&
        t.due_at &&
        new Date(t.due_at) <= today
    )
    .sort((a, b) => a.priority - b.priority);

  const top3 = myTasks.slice(0, 3);
  const more = myTasks.slice(3);
  const upcoming = tasks
    .filter(
      (t) =>
        t.assignee_id === userId &&
        t.status !== "done" &&
        t.due_at &&
        new Date(t.due_at) > today
    )
    .sort((a, b) => new Date(a.due_at || 0).getTime() - new Date(b.due_at || 0).getTime());

  return { top3, more, upcoming };
}

export function useUsers() {
  const users = useSyncExternalStore(store.subscribeUsers, store.getUsers, store.getUsers);
  return {
    users,
    updateUser: store.updateUser,
  };
}

export function useProjects() {
  const projects = useSyncExternalStore(
    store.subscribeProjects,
    store.getProjects,
    store.getProjects
  );
  return {
    projects,
    addProject: store.addProject,
    updateProject: store.updateProject,
    deleteProject: store.deleteProject,
  };
}

export function useTaskGroups() {
  const groups = useSyncExternalStore(store.subscribeGroups, store.getTaskGroups, store.getTaskGroups);
  return {
    groups,
    addTaskGroup: store.addTaskGroup,
  };
}

export function useTaskGroupProgress(groupId: string | undefined) {
  const { tasks } = useTasks();
  const groups = useSyncExternalStore(store.subscribeGroups, store.getTaskGroups, store.getTaskGroups);

  return useMemo(() => {
    if (!groupId) return null;

    const group = groups.find((g) => g.id === groupId);
    const groupTasks = tasks.filter((t) => t.group_id === groupId);
    const total = groupTasks.length;
    const done = groupTasks.filter((t) => t.status === "done").length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    // Don't show badge for single-task groups
    if (total <= 1) return null;

    return {
      total,
      done,
      percent,
      allDone: done === total && total > 0,
      originalInput: group?.original_input || "",
    };
  }, [groupId, tasks, groups]);
}

// L6: Removed unused useViewMode hook

export function useFilters() {
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);

  const filterTasks = useCallback(
    (tasks: Task[]) => {
      return tasks.filter((t) => {
        if (assigneeFilter && t.assignee_id !== assigneeFilter) return false;
        if (projectFilter && t.project_id !== projectFilter) return false;
        if (statusFilter && t.status !== statusFilter) return false;
        return true;
      });
    },
    [assigneeFilter, projectFilter, statusFilter]
  );

  return {
    assigneeFilter,
    setAssigneeFilter,
    projectFilter,
    setProjectFilter,
    statusFilter,
    setStatusFilter,
    filterTasks,
  };
}
