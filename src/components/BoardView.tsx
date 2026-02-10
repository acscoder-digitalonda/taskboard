"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Task, TaskStatus } from "@/types";
import { useTasks } from "@/lib/hooks";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import TaskCard from "./TaskCard";

const COLUMNS: TaskStatus[] = ["backlog", "doing", "waiting", "done"];

function SortableCard({
  task,
  onClickCard,
}: {
  task: Task;
  onClickCard?: (task: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        showDragHandle
        dragListeners={listeners}
        dragAttributes={attributes}
        onClickCard={onClickCard}
      />
    </div>
  );
}

function DroppableColumn({
  status,
  tasks,
  onClickCard,
}: {
  status: TaskStatus;
  tasks: Task[];
  onClickCard?: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="w-full md:flex-1 md:min-w-[280px] md:max-w-[360px]">
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[status] }}
        />
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-700">
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-xs text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] p-2 rounded-xl transition-colors ${
          isOver ? "bg-cyan-50 ring-2 ring-cyan-200" : "bg-gray-50/50"
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              onClickCard={onClickCard}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-300 text-sm">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

interface BoardViewProps {
  filteredTasks: Task[];
  onClickCard?: (task: Task) => void;
}

export default function BoardView({
  filteredTasks,
  onClickCard,
}: BoardViewProps) {
  const { moveTask } = useTasks();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const activeTask = filteredTasks.find((t) => t.id === activeId) || null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    if (COLUMNS.includes(overId as TaskStatus)) {
      moveTask(taskId, overId as TaskStatus);
      return;
    }

    const overTask = filteredTasks.find((t) => t.id === overId);
    if (overTask) {
      moveTask(taskId, overTask.status);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-4 px-1">
        {COLUMNS.map((status) => (
          <DroppableColumn
            key={status}
            status={status}
            tasks={filteredTasks
              .filter((t) => t.status === status)
              .sort((a, b) => a.priority - b.priority)}
            onClickCard={onClickCard}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 shadow-xl">
            <TaskCard task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
