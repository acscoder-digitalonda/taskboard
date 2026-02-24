"use client";

import { memo } from "react";
import { Task, TaskStatus } from "@/types";
import { getUserById, getProjectById, formatDue, isOverdue } from "@/lib/utils";
import { useTaskGroupProgress } from "@/lib/hooks";
import { store } from "@/lib/store";
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Trash2,
  ExternalLink,
  GripVertical,
  StickyNote,
  Layers,
} from "lucide-react";

interface TaskCardProps {
  task: Task;
  compact?: boolean;
  showDragHandle?: boolean;
  dragListeners?: any;
  dragAttributes?: any;
  onClickCard?: (task: Task) => void;
}

function TaskCard({
  task,
  compact = false,
  showDragHandle = false,
  dragListeners,
  dragAttributes,
  onClickCard,
}: TaskCardProps) {
  const user = getUserById(task.assignee_id);
  const project = getProjectById(task.project_id);
  const due = formatDue(task.due_at);
  const overdue = isOverdue(task.due_at);
  const groupProgress = useTaskGroupProgress(task.group_id);

  return (
    <div
      className={`bg-white rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group cursor-pointer ${
        compact ? "p-3" : "p-4"
      } ${task.status === "done" ? "opacity-60" : ""}`}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: user?.color || "#ccc",
      }}
      onClick={() => onClickCard?.(task)}
    >
      <div className="flex items-start gap-2">
        {showDragHandle && (
          <button
            className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
            onClick={(e) => e.stopPropagation()}
            {...(dragListeners || {})}
            {...(dragAttributes || {})}
          >
            <GripVertical size={16} />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {task.client && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-none">
              {task.client}
            </span>
          )}
          <p
            className={`font-medium text-gray-900 leading-tight ${
              compact ? "text-sm" : "text-base"
            } ${task.status === "done" ? "line-through" : ""}`}
          >
            {task.title}
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {user && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: user.color }}
              >
                {user.initials}
                <span className="hidden sm:inline">{user.name}</span>
              </span>
            )}

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

            {due && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  overdue
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <Clock size={10} />
                {due}
              </span>
            )}

            {task.drive_links.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                <ExternalLink size={10} />
                {task.drive_links.length}
              </span>
            )}

            {task.notes.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700">
                <StickyNote size={10} />
                {task.notes.length}
              </span>
            )}

            {groupProgress && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  groupProgress.allDone
                    ? "bg-green-50 text-green-700"
                    : "bg-cyan-50 text-cyan-700"
                }`}
                title={`Task group: ${groupProgress.done}/${groupProgress.total} done`}
              >
                <Layers size={10} />
                {groupProgress.done}/{groupProgress.total}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div
          className="flex flex-col gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {task.status !== "done" && (
            <button
              onClick={() => store.moveTask(task.id, "done")}
              className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
              title="Mark done"
            >
              <CheckCircle2 size={16} />
            </button>
          )}
          {task.status === "backlog" && (
            <button
              onClick={() => store.moveTask(task.id, "doing")}
              className="p-1 rounded hover:bg-cyan-50 text-gray-400 hover:text-cyan-600"
              title="Start"
            >
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// L1: Memoize to prevent re-renders when parent updates but task props are unchanged
export default memo(TaskCard);
