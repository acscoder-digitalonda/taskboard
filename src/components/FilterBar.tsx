"use client";

import { USERS } from "@/lib/data";
import { useProjects } from "@/lib/hooks";
import { TaskStatus } from "@/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { X } from "lucide-react";

interface FilterBarProps {
  assigneeFilter: string | null;
  setAssigneeFilter: (v: string | null) => void;
  projectFilter: string | null;
  setProjectFilter: (v: string | null) => void;
  statusFilter: TaskStatus | null;
  setStatusFilter: (v: TaskStatus | null) => void;
}

export default function FilterBar({
  assigneeFilter,
  setAssigneeFilter,
  projectFilter,
  setProjectFilter,
  statusFilter,
  setStatusFilter,
}: FilterBarProps) {
  const { projects } = useProjects();
  const hasFilters = assigneeFilter || projectFilter || statusFilter;

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      {/* Assignee */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">
          Person
        </span>
        <div className="flex gap-1">
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() =>
                setAssigneeFilter(assigneeFilter === u.id ? null : u.id)
              }
              className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                assigneeFilter === u.id
                  ? "ring-2 ring-offset-2 text-white scale-110"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={
                assigneeFilter === u.id
                  ? { backgroundColor: u.color }
                  : {}
              }
              title={u.name}
            >
              {u.initials}
            </button>
          ))}
        </div>
      </div>

      <div className="w-px h-6 bg-gray-200 hidden sm:block" />

      {/* Project */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">
          Project
        </span>
        <div className="flex gap-1 flex-wrap">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                setProjectFilter(projectFilter === p.id ? null : p.id)
              }
              className={`px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-semibold transition-all ${
                projectFilter === p.id
                  ? "text-white scale-105"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={
                projectFilter === p.id
                  ? { backgroundColor: p.color }
                  : {}
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="w-px h-6 bg-gray-200 hidden sm:block" />

      {/* Status */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">
          Status
        </span>
        <div className="flex gap-1 flex-wrap">
          {(["backlog", "doing", "waiting", "done"] as TaskStatus[]).map((s) => (
            <button
              key={s}
              onClick={() =>
                setStatusFilter(statusFilter === s ? null : s)
              }
              className={`px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-semibold transition-all ${
                statusFilter === s
                  ? "text-white scale-105"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={
                statusFilter === s
                  ? { backgroundColor: STATUS_COLORS[s] }
                  : {}
              }
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => {
            setAssigneeFilter(null);
            setProjectFilter(null);
            setStatusFilter(null);
          }}
          className="flex items-center gap-1 px-2 py-1.5 sm:py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
