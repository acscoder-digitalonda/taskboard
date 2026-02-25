"use client";

import { Task } from "@/types";
import { getUserById, getProjectById, formatDue, isOverdue, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { store } from "@/lib/store";
import { apiFetch } from "@/lib/api-client";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { useState } from "react";

interface ListViewProps {
  filteredTasks: Task[];
  onClickCard?: (task: Task) => void;
  loading?: boolean;
  currentUserId?: string;
}

type SortKey = "title" | "assignee" | "project" | "status" | "due" | "priority";

export default function ListView({ filteredTasks, onClickCard, loading, currentUserId }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const sorted = [...filteredTasks].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "assignee":
        cmp = (getUserById(a.assignee_id)?.name || "").localeCompare(
          getUserById(b.assignee_id)?.name || ""
        );
        break;
      case "project":
        cmp = (getProjectById(a.project_id)?.name || "").localeCompare(
          getProjectById(b.project_id)?.name || ""
        );
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "due":
        cmp =
          new Date(a.due_at || 0).getTime() -
          new Date(b.due_at || 0).getTime();
        break;
      case "priority":
        cmp = a.priority - b.priority;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({
    label,
    field,
    className = "",
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-900 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b border-gray-100">
              <SortHeader label="Title" field="title" className="min-w-[250px]" />
              <SortHeader label="Assignee" field="assignee" />
              <SortHeader label="Project" field="project" />
              <SortHeader label="Status" field="status" />
              <SortHeader label="Due" field="due" />
              <th className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 w-16">
                <span className="hidden sm:inline">Actions</span>
                <span className="sm:hidden">✓</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const user = getUserById(task.assignee_id);
              const project = getProjectById(task.project_id);
              const due = formatDue(task.due_at);
              const overdue = isOverdue(task.due_at) && task.status !== "done";

              return (
                <tr
                  key={task.id}
                  onClick={() => onClickCard?.(task)}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                    task.status === "done" ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-8 rounded-full flex-shrink-0"
                        style={{ backgroundColor: user?.color || "#ccc" }}
                      />
                      <span
                        className={`font-medium text-sm text-gray-900 ${
                          task.status === "done" ? "line-through" : ""
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.drive_links.length > 0 && (
                        <a
                          href={task.drive_links[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {project && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: project.color + "20",
                          color: project.color,
                        }}
                      >
                        {project.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {due && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          overdue ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        <Clock size={10} />
                        {due}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {task.status !== "done" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          store.moveTask(task.id, "done");
                          // Notify assignee
                          if (task.assignee_id && task.assignee_id !== currentUserId) {
                            const actorName = getUserById(currentUserId || "")?.name || "Someone";
                            apiFetch("/api/notifications/send", {
                              method: "POST",
                              body: JSON.stringify({
                                user_id: task.assignee_id,
                                type: "task_completed",
                                title: `Task completed: ${task.title}`,
                                body: `${actorName} marked this task as done`,
                                link: `/tasks/${task.id}`,
                                reference_id: task.id,
                                reference_type: "task",
                              }),
                            }).catch((err) => console.error("Notification failed:", err));
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                        title="Mark done"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-50">
        {/* Sort controls */}
        <div className="flex gap-2 p-3 overflow-x-auto">
          {(["priority", "title", "due", "status"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                sortKey === key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
              {sortKey === key && (
                <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
        </div>

        {sorted.map((task) => {
          const user = getUserById(task.assignee_id);
          const project = getProjectById(task.project_id);
          const due = formatDue(task.due_at);
          const overdue = isOverdue(task.due_at) && task.status !== "done";

          return (
            <div
              key={task.id}
              onClick={() => onClickCard?.(task)}
              className={`p-3 active:bg-gray-50 transition-colors cursor-pointer ${
                task.status === "done" ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-1.5 h-full min-h-[40px] rounded-full flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: user?.color || "#ccc" }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium text-sm text-gray-900 ${
                      task.status === "done" ? "line-through" : ""
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {user && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.initials}
                      </span>
                    )}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                    {project && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: project.color + "20",
                          color: project.color,
                        }}
                      >
                        {project.name}
                      </span>
                    )}
                    {due && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                          overdue ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        <Clock size={9} />
                        {due}
                      </span>
                    )}
                  </div>
                </div>
                {task.status !== "done" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      store.moveTask(task.id, "done");
                      // Notify assignee
                      if (task.assignee_id && task.assignee_id !== currentUserId) {
                        const actorName = getUserById(currentUserId || "")?.name || "Someone";
                        apiFetch("/api/notifications/send", {
                          method: "POST",
                          body: JSON.stringify({
                            user_id: task.assignee_id,
                            type: "task_completed",
                            title: `Task completed: ${task.title}`,
                            body: `${actorName} marked this task as done`,
                            link: `/tasks/${task.id}`,
                            reference_id: task.id,
                            reference_type: "task",
                          }),
                        }).catch((err) => console.error("Notification failed:", err));
                      }
                    }}
                    className="p-2 rounded-lg text-gray-300 hover:text-green-600 active:bg-green-50 transition-colors flex-shrink-0"
                  >
                    <CheckCircle2 size={20} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* H4: Distinguish loading from empty */}
      {loading && sorted.length === 0 && (
        <div className="divide-y divide-gray-50">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="w-1.5 h-8 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && sorted.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No tasks match your filters
        </div>
      )}
    </div>
  );
}
