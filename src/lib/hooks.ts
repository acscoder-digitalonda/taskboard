"use client";

import { useSyncExternalStore, useCallback, useState } from "react";
import { store } from "./store";
import { Task, TaskStatus, ViewMode } from "@/types";

export function useTasks() {
  const tasks = useSyncExternalStore(store.subscribe, store.getTasks, store.getTasks);
  return {
    tasks,
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
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  return { top3, more, upcoming };
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

export function useViewMode() {
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  return { viewMode, setViewMode };
}

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
