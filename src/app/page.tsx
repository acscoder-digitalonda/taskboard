"use client";

import { useState } from "react";
import { useTasks, useFilters } from "@/lib/hooks";
import { USERS } from "@/lib/data";
import { Task, ViewMode } from "@/types";
import BoardView from "@/components/BoardView";
import ListView from "@/components/ListView";
import MyDayView from "@/components/MyDayView";
import ChatPanel from "@/components/ChatPanel";
import FilterBar from "@/components/FilterBar";
import TaskDetailDrawer from "@/components/TaskDetailDrawer";
import ProjectManager from "@/components/ProjectManager";
import {
  LayoutGrid,
  List,
  Sun,
  ChevronDown,
  FolderOpen,
} from "lucide-react";

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [currentUserId, setCurrentUserId] = useState("u1"); // Jordan default
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const { tasks } = useTasks();
  const {
    assigneeFilter,
    setAssigneeFilter,
    projectFilter,
    setProjectFilter,
    statusFilter,
    setStatusFilter,
    filterTasks,
  } = useFilters();

  const filteredTasks = filterTasks(tasks);
  const currentUser = USERS.find((u) => u.id === currentUserId)!;

  function handleClickCard(task: Task) {
    setSelectedTask(task);
  }

  // Keep drawer in sync with store updates
  const drawerTask = selectedTask
    ? tasks.find((t) => t.id === selectedTask.id) || null
    : null;

  return (
    <div className="min-h-screen bg-white">
      {/* Top navbar */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          {/* Logo / Title */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)",
              }}
            >
              <span className="text-white font-black text-xs sm:text-sm">TB</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-gray-900 hidden sm:block">
              TASKBOARD
            </h1>
          </div>

          {/* View tabs */}
          <div className="flex items-center bg-gray-50 rounded-xl p-1 gap-0.5">
            {[
              { mode: "myday" as ViewMode, icon: Sun, label: "My Day" },
              { mode: "board" as ViewMode, icon: LayoutGrid, label: "Board" },
              { mode: "list" as ViewMode, icon: List, label: "List" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  viewMode === mode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Right side: Projects button + User selector */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowProjectManager(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <FolderOpen size={15} />
              <span className="hidden sm:inline">Projects</span>
            </button>

            <div className="relative hidden sm:block">
              <select
                value={currentUserId}
                onChange={(e) => setCurrentUserId(e.target.value)}
                className="appearance-none bg-gray-50 rounded-xl px-4 py-2 pr-8 text-sm font-bold text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white font-bold text-xs cursor-pointer"
              style={{ backgroundColor: currentUser.color }}
              onClick={() => {
                // Cycle through users on mobile (where dropdown is hidden)
                const idx = USERS.findIndex((u) => u.id === currentUserId);
                setCurrentUserId(USERS[(idx + 1) % USERS.length].id);
              }}
            >
              {currentUser.initials}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Filters (not shown on My Day) */}
        {viewMode !== "myday" && (
          <div className="mb-6">
            <FilterBar
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={setAssigneeFilter}
              projectFilter={projectFilter}
              setProjectFilter={setProjectFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
            />
          </div>
        )}

        {/* Content area */}
        <div className="flex gap-6">
          {/* Main view */}
          <div className="flex-1 min-w-0">
            {viewMode === "board" && (
              <BoardView
                filteredTasks={filteredTasks}
                onClickCard={handleClickCard}
              />
            )}
            {viewMode === "list" && (
              <ListView
                filteredTasks={filteredTasks}
                onClickCard={handleClickCard}
              />
            )}
            {viewMode === "myday" && (
              <MyDayView
                userId={currentUserId}
                onClickCard={handleClickCard}
              />
            )}
          </div>

          {/* Chat panel (sidebar) */}
          <div className="w-[380px] flex-shrink-0 hidden lg:block">
            <div className="sticky top-[90px]">
              <ChatPanel currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      </main>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setSelectedTask(null)}
      />

      {/* Project Manager Modal */}
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}

      {/* Mobile chat button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <MobileChatButton currentUserId={currentUserId} />
      </div>
    </div>
  );
}

function MobileChatButton({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />
      )}
      {open && (
        <div className="fixed bottom-20 right-4 left-4 z-50 max-w-md ml-auto">
          <ChatPanel currentUserId={currentUserId} />
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all"
        style={{
          background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
        </svg>
      </button>
    </>
  );
}
