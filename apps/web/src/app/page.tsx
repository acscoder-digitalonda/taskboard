"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useTasks, useFilters } from "@/lib/hooks";
import { Task, ViewMode } from "@/types";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoginPage from "@/components/LoginPage";
import FilterBar from "@/components/FilterBar";
import NotificationBell from "@/components/NotificationBell";
import PushPromptBanner from "@/components/PushPromptBanner";
import Toast from "@/components/Toast";
import UserMenu from "@/components/UserMenu";
import { shouldAutoShowOnboarding, incrementSeenCount } from "@/lib/onboarding";

// Lazy-load heavy view components — only the active view's code is downloaded
const BoardView = lazy(() => import("@/components/BoardView"));
const ListView = lazy(() => import("@/components/ListView"));
const MyDayView = lazy(() => import("@/components/MyDayView"));
const MessagingView = lazy(() => import("@/components/MessagingView"));
const ChatPanel = lazy(() => import("@/components/ChatPanel"));
const TaskDetailDrawer = lazy(() => import("@/components/TaskDetailDrawer"));
const ProjectManager = lazy(() => import("@/components/ProjectManager"));
const TeamManager = lazy(() => import("@/components/TeamManager"));
const SearchPanel = lazy(() => import("@/components/SearchPanel"));
const OnboardingModal = lazy(() => import("@/components/OnboardingModal"));
import {
  LayoutGrid,
  List,
  Sun,
  FolderOpen,
  MessageSquare,
  Search,
  Users,
} from "lucide-react";

export default function Home() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  );
}

// DEV_BYPASS: Set NEXT_PUBLIC_DEV_BYPASS_AUTH=true in .env.local for dev preview.
const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)" }}
      >
        <span className="text-white font-black text-sm">TB</span>
      </div>
    </div>
  );
}

function AuthGate() {
  const { session, currentUser, isLoading } = useAuth();

  // Always wait for auth to finish loading (incl. dev bypass user resolution)
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Dev bypass: skip login check, but still need currentUser resolved
  if (DEV_BYPASS_AUTH) {
    if (!currentUser) return <LoadingScreen />;
    return <AppShell />;
  }

  if (!session || !currentUser) {
    return <LoginPage />;
  }

  return <AppShell />;
}

function AppShell() {
  const { currentUser, signOut } = useAuth();
  // currentUser is guaranteed non-null by AuthGate before AppShell renders
  const user = currentUser!;
  const currentUserId = user.id;

  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showTeamManager, setShowTeamManager] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingIsAutoShown, setOnboardingIsAutoShown] = useState(false);
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const { tasks, loading: tasksLoading } = useTasks();
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

  function handleClickCard(task: Task) {
    setSelectedTask(task);
  }

  // Keep drawer in sync with store updates
  const drawerTask = selectedTask
    ? tasks.find((t) => t.id === selectedTask.id) || null
    : null;

  // H9: Use ref to avoid re-registering listener on every showSearch change
  const showSearchRef = useRef(showSearch);
  useEffect(() => { showSearchRef.current = showSearch; }, [showSearch]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
      if (e.key === "Escape" && showSearchRef.current) {
        setShowSearch(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Auto-show onboarding only on first login
  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (!currentUserId || onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;

    // Check BEFORE incrementing so first visit (count 0) passes the < 1 check
    const shouldShow = shouldAutoShowOnboarding(currentUserId);
    incrementSeenCount(currentUserId);

    if (shouldShow) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
        setOnboardingIsAutoShown(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [currentUserId]);

  // Register service worker for PWA install
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed — not critical for app function
      });
    }
  }, []);

  // Push notifications are handled by <PushPromptBanner /> which uses a
  // user gesture (tap) to trigger Notification.requestPermission().
  // This is required for iOS 16.4+ PWA push support.

  // Check AI availability on mount
  useEffect(() => {
    async function checkAI() {
      try {
        const res = await fetch("/api/chat/status");
        if (res.ok) {
          const data = await res.json();
          setAiConnected(data.ai_available === true);
        }
      } catch {
        // Network error — leave as unknown
      }
    }
    checkAI();
  }, []);

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
          <div className="flex items-center bg-gray-50 rounded-xl p-0.5 sm:p-1 gap-0.5">
            {[
              { mode: "myday" as ViewMode, icon: Sun, label: "My Day" },
              { mode: "board" as ViewMode, icon: LayoutGrid, label: "Board" },
              { mode: "list" as ViewMode, icon: List, label: "List" },
              { mode: "messages" as ViewMode, icon: MessageSquare, label: "Msgs" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  viewMode === mode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Right side: Search + Notifications + Projects + User + Sign out */}
          <div className="flex items-center gap-1 sm:gap-2 lg:gap-3">
            {/* Search */}
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 sm:px-3 sm:py-2 bg-gray-50 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex items-center gap-1.5"
              title="Search (⌘K)"
            >
              <Search size={15} />
              <span className="hidden md:inline text-xs">Search</span>
              <kbd className="hidden lg:inline text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-400">
                ⌘K
              </kbd>
            </button>

            {/* Notifications */}
            <NotificationBell userId={currentUserId} />

            {/* Projects */}
            <button
              onClick={() => setShowProjectManager(true)}
              className="p-2 sm:px-3 sm:py-2 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
              title="Projects"
            >
              <FolderOpen size={15} />
              <span className="hidden md:inline">Projects</span>
            </button>

            {/* Team Roles */}
            <button
              onClick={() => setShowTeamManager(true)}
              className="p-2 sm:px-3 sm:py-2 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
              title="Team"
            >
              <Users size={15} />
              <span className="hidden md:inline">Team</span>
            </button>

            <span className="hidden lg:inline text-sm font-bold text-gray-600">
              {user.name}
            </span>

            <UserMenu
              user={user}
              onSignOut={signOut}
              aiConnected={aiConnected}
              onOpenOnboarding={() => {
                setShowOnboarding(true);
                setOnboardingIsAutoShown(false);
              }}
            />
          </div>
        </div>
      </header>

      {/* Push notification enable banner (iOS requires user gesture) */}
      <PushPromptBanner />

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <Suspense fallback={null}>
        {/* Messages view (full width, no chat sidebar) */}
        {viewMode === "messages" ? (
          <MessagingView
            onOpenTask={(taskId) => {
              const task = tasks.find((t) => t.id === taskId);
              if (task) setSelectedTask(task);
            }}
          />
        ) : (
          <>
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
                    loading={tasksLoading}
                    currentUserId={currentUserId}
                  />
                )}
                {viewMode === "list" && (
                  <ListView
                    filteredTasks={filteredTasks}
                    onClickCard={handleClickCard}
                    loading={tasksLoading}
                    currentUserId={currentUserId}
                  />
                )}
                {viewMode === "myday" && (
                  <MyDayView
                    userId={currentUserId}
                    onClickCard={handleClickCard}
                  />
                )}
              </div>

              {/* Chat panel (sidebar) — only for task views */}
              <div className="w-[380px] flex-shrink-0 hidden lg:block">
                <div className="sticky top-[90px]">
                  <ChatPanel currentUserId={currentUserId} aiConnected={aiConnected} />
                </div>
              </div>
            </div>
          </>
        )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setSelectedTask(null)}
        currentUserId={currentUserId}
      />

      {/* Project Manager Modal */}
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} currentUserId={currentUserId} />
      )}

      {/* Team Manager Modal */}
      {showTeamManager && (
        <TeamManager onClose={() => setShowTeamManager(false)} />
      )}

      {/* Search Modal */}
      {showSearch && (
        <SearchPanel
          onSelectResult={(result) => {
            setShowSearch(false);
            if (result.type === "task") {
              const task = tasks.find((t) => t.id === result.id);
              if (task) setSelectedTask(task);
            }
            if (result.type === "channel") {
              setViewMode("messages");
            }
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => setShowOnboarding(false)}
          userId={currentUserId}
          isAutoShown={onboardingIsAutoShown}
        />
      )}
      </Suspense>

      {/* Mobile chat button (not shown on messages view) */}
      {viewMode !== "messages" && (
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <MobileChatButton currentUserId={currentUserId} />
        </div>
      )}

      {/* Error toast notifications */}
      <Toast />
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
