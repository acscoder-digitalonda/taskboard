"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Task, TaskStatus, SECTION_PRESETS, FileAttachment, NotificationType } from "@/types";
import { store } from "@/lib/store";
import { useProjects, useUsers, useTaskGroupProgress } from "@/lib/hooks";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  getUserById,
  getProjectById,
  formatDue,
  isOverdue,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";
import {
  X,
  Clock,
  User,
  FolderOpen,
  Flag,
  Link2,
  StickyNote,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Edit3,
  Save,
  ChevronDown,
  Layers,
  Paperclip,
  Mail,
} from "lucide-react";
import { getTaskFiles, deleteFile } from "@/lib/files";
import { apiFetch } from "@/lib/api-client";
import { notificationStore } from "@/lib/notifications";
import FileUploadZone from "./FileUploadZone";
import FileList from "./FileList";

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  currentUserId?: string;
}

export default function TaskDetailDrawer({
  task,
  onClose,
  currentUserId,
}: TaskDetailDrawerProps) {
  const { projects } = useProjects();
  const { users } = useUsers();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingClient, setEditingClient] = useState(false);
  const [clientValue, setClientValue] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionContentValue, setSectionContentValue] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionHeading, setNewSectionHeading] = useState("");
  const [newSectionContent, setNewSectionContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newLink, setNewLink] = useState("");
  const [taskFiles, setTaskFiles] = useState<FileAttachment[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Load files when task changes
  useEffect(() => {
    if (task?.id) {
      setLoadingFiles(true);
      getTaskFiles(task.id)
        .then((files) => setTaskFiles(files))
        .catch(() => setTaskFiles([]))
        .finally(() => setLoadingFiles(false));
    } else {
      setTaskFiles([]);
    }
  }, [task?.id]);

  const handleFileUploaded = useCallback((attachment: FileAttachment) => {
    setTaskFiles((prev) => [attachment, ...prev]);
  }, []);

  const handleFileDelete = useCallback(async (file: FileAttachment) => {
    const success = await deleteFile(file.id, file.storage_path);
    if (success) {
      setTaskFiles((prev) => prev.filter((f) => f.id !== file.id));
    }
  }, []);

  /**
   * Send a push notification to a task's assignee when a field changes.
   * Skips if the assignee is the current user (no self-notifications).
   */
  const notifyTaskUpdate = useCallback(
    (
      assigneeId: string | undefined,
      type: NotificationType,
      title: string,
      body: string,
      priority?: number
    ) => {
      if (!assigneeId || assigneeId === currentUserId || !task?.id) return;
      apiFetch("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify({
          user_id: assigneeId,
          type,
          title,
          body,
          link: `/tasks/${task.id}`,
          reference_id: task.id,
          reference_type: "task",
          priority: priority ?? task?.priority,
        }),
      }).catch((err) => console.error("Notification failed:", err));
    },
    [currentUserId, task?.id, task?.priority]
  );

  // M4: Lock body scroll while drawer is open
  useEffect(() => {
    if (!task) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [task]);

  // M5: Trap focus within drawer when open
  const trapRef = useFocusTrap<HTMLDivElement>(!!task);

  // M8: Close drawer on Escape key
  useEffect(() => {
    if (!task) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [task, onClose]);

  // Task group progress — null if not in a group or single-task group
  const groupProgress = useTaskGroupProgress(task?.group_id);

  // ── Debounced edit notifications ──────────────────────────────
  // Snapshot task state when drawer opens. After edits, send ONE
  // batched "task_updated" notification to the assignee (2s debounce).
  interface TaskBaseline {
    title: string;
    assignee_id: string;
    status: TaskStatus;
    priority: number;
    due_at?: string;
    project_id?: string;
    client?: string;
    noteCount: number;
    sectionCount: number;
    sectionContent: string; // concatenated for change detection
  }

  function snapshotTask(t: Task): TaskBaseline {
    return {
      title: t.title,
      assignee_id: t.assignee_id,
      status: t.status,
      priority: t.priority,
      due_at: t.due_at,
      project_id: t.project_id,
      client: t.client,
      noteCount: t.notes?.length || 0,
      sectionCount: t.sections?.length || 0,
      sectionContent: t.sections?.map((s) => `${s.heading}:${s.content}`).join("|") || "",
    };
  }

  const baselineRef = useRef<TaskBaseline | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChangesRef = useRef<string[]>([]);

  // Capture baseline when a new task opens
  useEffect(() => {
    if (task) {
      baselineRef.current = snapshotTask(task);
      pendingChangesRef.current = [];
    }
    return () => {
      // Flush pending notification when drawer closes / task changes
      if (notifyTimerRef.current) {
        clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = null;
      }
      if (pendingChangesRef.current.length > 0 && baselineRef.current && task) {
        const assigneeId = task.assignee_id;
        const changerName = getUserById(currentUserId || "")?.name || "Someone";
        const changes = [...pendingChangesRef.current];
        pendingChangesRef.current = [];
        apiFetch("/api/notifications/send", {
          method: "POST",
          body: JSON.stringify({
            user_id: assigneeId,
            type: "task_updated",
            title: `Task updated: ${task.title}`,
            body: `${changerName} changed: ${changes.join(", ")}`,
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: task.priority,
          }),
        }).then(async (res) => {
          if (res.ok) {
            try {
              const { notification } = await res.json();
              if (notification) notificationStore.addLocalNotification(notification);
            } catch { /* not critical */ }
          }
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Watch for changes and send debounced notification
  useEffect(() => {
    if (!task || !baselineRef.current || !currentUserId) return;
    const baseline = baselineRef.current;

    // Compute diff
    const changes: string[] = [];
    if (task.title !== baseline.title) changes.push("title");
    if (task.status !== baseline.status) changes.push(`status → ${STATUS_LABELS[task.status]}`);
    if (task.priority !== baseline.priority) changes.push(`priority → P${task.priority}`);
    if (task.due_at !== baseline.due_at) changes.push("due date");
    if (task.project_id !== baseline.project_id) changes.push("project");
    if (task.client !== baseline.client) changes.push("client");
    if ((task.notes?.length || 0) !== baseline.noteCount) changes.push("notes");
    if ((task.sections?.length || 0) !== baseline.sectionCount) changes.push("sections");
    const currentSectionContent = task.sections?.map((s) => `${s.heading}:${s.content}`).join("|") || "";
    if (currentSectionContent !== baseline.sectionContent && !changes.includes("sections")) {
      changes.push("section content");
    }

    if (changes.length === 0) return;

    // Store pending changes for flush-on-close
    pendingChangesRef.current = changes;

    // Clear previous timer
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);

    // Debounce: send after 2 seconds of quiet
    notifyTimerRef.current = setTimeout(async () => {
      const changerName = getUserById(currentUserId)?.name || "Someone";
      try {
        const res = await apiFetch("/api/notifications/send", {
          method: "POST",
          body: JSON.stringify({
            user_id: task.assignee_id,
            type: "task_updated",
            title: `Task updated: ${task.title}`,
            body: `${changerName} changed: ${changes.join(", ")}`,
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: task.priority,
          }),
        });
        // Inject into local store for instant bell update
        if (res.ok) {
          try {
            const { notification } = await res.json();
            if (notification) notificationStore.addLocalNotification(notification);
          } catch { /* not critical */ }
        }
      } catch { /* silent */ }

      // Reset baseline so subsequent edits don't re-notify for same changes
      baselineRef.current = snapshotTask(task);
      pendingChangesRef.current = [];
      notifyTimerRef.current = null;
    }, 2000);

    return () => {
      if (notifyTimerRef.current) {
        clearTimeout(notifyTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.title, task?.status, task?.priority, task?.due_at, task?.project_id, task?.client, task?.assignee_id, task?.notes?.length, task?.sections?.length, task?.sections?.map((s) => s.content).join("|"), currentUserId]);

  if (!task) return null;

  const user = getUserById(task.assignee_id);
  const due = formatDue(task.due_at);
  const overdue = isOverdue(task.due_at) && task.status !== "done";
  const createdBy = getUserById(task.created_by_id);

  function startEditTitle() {
    setTitleValue(task!.title);
    setEditingTitle(true);
  }

  function saveTitle() {
    if (titleValue.trim()) {
      store.updateTask(task!.id, { title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  function startEditClient() {
    setClientValue(task!.client || "");
    setEditingClient(true);
  }

  function saveClient() {
    store.updateTask(task!.id, { client: clientValue.trim() || undefined });
    setEditingClient(false);
  }

  function startEditSection(sectionId: string, content: string) {
    setEditingSectionId(sectionId);
    setSectionContentValue(content);
  }

  function saveSection(sectionId: string) {
    store.updateSectionInTask(task!.id, sectionId, {
      content: sectionContentValue,
    });
    setEditingSectionId(null);
  }

  function handleAddSection(heading: string) {
    if (!heading.trim()) return;
    store.addSectionToTask(task!.id, heading.trim(), newSectionContent.trim());
    setNewSectionHeading("");
    setNewSectionContent("");
    setShowAddSection(false);
  }

  function addNote() {
    if (!newNote.trim()) return;
    store.addNoteToTask(task!.id, newNote.trim());
    setNewNote("");
  }

  function addLink() {
    if (!newLink.trim()) return;
    store.addDriveLinkToTask(task!.id, newLink.trim());
    setNewLink("");
  }

  // Which preset headings aren't already used
  const usedHeadings = new Set(task.sections.map((s) => s.heading));
  const availablePresets = SECTION_PRESETS.filter((h) => !usedHeadings.has(h));

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" ref={trapRef}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-full sm:max-w-[560px] bg-white shadow-2xl border-l border-gray-100 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Task details">
        {/* Color accent bar */}
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: user?.color || "#00BCD4" }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <X size={18} />
        </button>

        <div className="p-4 sm:p-6 space-y-5">
          {/* ── Client label ── */}
          {editingClient ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={clientValue}
                onChange={(e) => setClientValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveClient()}
                placeholder="Client name..."
                className="flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-200"
                autoFocus
              />
              <button
                onClick={saveClient}
                className="p-1.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
              >
                <Save size={12} />
              </button>
              <button
                onClick={() => setEditingClient(false)}
                className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200"
              >
                <X size={12} />
              </button>
            </div>
          ) : task.client ? (
            <span
              onClick={startEditClient}
              className="inline-block text-xs font-bold uppercase tracking-wider text-gray-400 cursor-pointer hover:text-cyan-500 transition-colors"
            >
              Client: {task.client}
            </span>
          ) : (
            <span
              onClick={startEditClient}
              className="inline-block text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer hover:text-gray-500 transition-colors italic"
            >
              + Add client
            </span>
          )}

          {/* ── Title ── */}
          <div>
            {editingTitle ? (
              <div className="flex gap-2 items-start">
                <textarea
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className={`flex-1 text-xl font-black text-gray-900 bg-gray-50 border rounded-xl p-3 focus:outline-none focus:ring-2 resize-none ${!titleValue.trim() ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:ring-cyan-200"}`}
                  rows={2}
                  autoFocus
                />
                <button
                  onClick={saveTitle}
                  className="p-2 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600"
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <h2
                onClick={startEditTitle}
                className="text-xl font-black text-gray-900 leading-tight cursor-pointer hover:text-cyan-600 transition-colors pr-10"
              >
                {task.title}
              </h2>
            )}

            {/* Status badge row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: STATUS_COLORS[task.status] }}
              >
                {STATUS_LABELS[task.status]}
              </span>

              {due && (
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                    overdue
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <Clock size={11} />
                  {due}
                </span>
              )}

              {task.priority <= 2 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                  <Flag size={11} />
                  P{task.priority}
                </span>
              )}

              {task.email_draft_id && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-cyan-50 text-cyan-600 border border-cyan-100">
                  <Mail size={11} />
                  From email
                </span>
              )}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── Sections ── */}
          {task.sections.length > 0 && (
            <div className="space-y-4">
              {task.sections.map((section) => (
                <div key={section.id} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {section.heading}
                    </span>
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          startEditSection(section.id, section.content)
                        }
                        className="p-1.5 sm:p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() =>
                          store.removeSectionFromTask(task.id, section.id)
                        }
                        className="p-1.5 sm:p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {editingSectionId === section.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={sectionContentValue}
                        onChange={(e) => setSectionContentValue(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y min-h-[80px]"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveSection(section.id)}
                          className="px-3 py-1.5 bg-cyan-500 text-white text-xs font-bold rounded-lg hover:bg-cyan-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSectionId(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() =>
                        startEditSection(section.id, section.content)
                      }
                      className="text-sm text-gray-600 leading-relaxed whitespace-pre-line cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors"
                    >
                      {section.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Add Section ── */}
          {showAddSection ? (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
              {/* Preset heading chips */}
              {availablePresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availablePresets.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setNewSectionHeading(preset)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                        newSectionHeading === preset
                          ? "bg-cyan-500 text-white"
                          : "bg-white text-gray-500 border border-gray-200 hover:border-cyan-300 hover:text-cyan-600"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={newSectionHeading}
                onChange={(e) => setNewSectionHeading(e.target.value)}
                placeholder="Section heading (or pick above)..."
                className="w-full px-3 py-2 text-sm font-bold bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />

              <textarea
                value={newSectionContent}
                onChange={(e) => setNewSectionContent(e.target.value)}
                placeholder="Section content..."
                className="w-full bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y min-h-[60px]"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => handleAddSection(newSectionHeading)}
                  disabled={!newSectionHeading.trim()}
                  className="px-3 py-1.5 bg-cyan-500 text-white text-xs font-bold rounded-lg hover:bg-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Add Section
                </button>
                <button
                  onClick={() => {
                    setShowAddSection(false);
                    setNewSectionHeading("");
                    setNewSectionContent("");
                  }}
                  className="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-cyan-500 transition-colors"
            >
              <Plus size={14} />
              Add section
            </button>
          )}

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── Fields Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Assignee */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <User size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Assignee
                </span>
              </div>
              <select
                value={task.assignee_id}
                onChange={(e) => {
                  const newAssignee = e.target.value;
                  const oldAssignee = task.assignee_id;
                  store.updateTask(task.id, { assignee_id: newAssignee });

                  const actorName = getUserById(currentUserId || "")?.name || "Someone";

                  // Notify new assignee
                  if (newAssignee !== oldAssignee && newAssignee !== currentUserId) {
                    notifyTaskUpdate(
                      newAssignee,
                      "task_assigned",
                      `Task assigned: ${task.title}`,
                      `${actorName} assigned you a task`
                    );
                  }
                }}
                className="w-full px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Project */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FolderOpen size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Project
                </span>
              </div>
              <select
                value={task.project_id || ""}
                onChange={(e) =>
                  store.updateTask(task.id, {
                    project_id: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 cursor-pointer"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Status
                </span>
              </div>
              <select
                value={task.status}
                onChange={(e) => {
                  const newStatus = e.target.value as TaskStatus;
                  const oldStatus = task.status;
                  store.updateTask(task.id, { status: newStatus });

                  if (newStatus !== oldStatus) {
                    const actorName = getUserById(currentUserId || "")?.name || "Someone";
                    const type = newStatus === "done" ? "task_completed" : "task_updated";
                    notifyTaskUpdate(
                      task.assignee_id,
                      type,
                      newStatus === "done"
                        ? `Task completed: ${task.title}`
                        : `Task status changed: ${task.title}`,
                      `${actorName} changed status to ${STATUS_LABELS[newStatus]}`
                    );
                  }
                }}
                className="w-full px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 cursor-pointer"
              >
                {(["backlog", "doing", "waiting", "done"] as TaskStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Priority */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Flag size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Priority
                </span>
              </div>
              <select
                value={task.priority}
                onChange={(e) => {
                  const newPriority = parseInt(e.target.value);
                  const oldPriority = task.priority;
                  store.updateTask(task.id, { priority: newPriority });

                  if (newPriority !== oldPriority) {
                    const actorName = getUserById(currentUserId || "")?.name || "Someone";
                    const labels = ["", "P1 — Urgent", "P2 — High", "P3 — Normal", "P4 — Low"];
                    notifyTaskUpdate(
                      task.assignee_id,
                      "task_updated",
                      `Task priority changed: ${task.title}`,
                      `${actorName} changed priority to ${labels[newPriority] || `P${newPriority}`}`,
                      newPriority
                    );
                  }
                }}
                className="w-full px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 cursor-pointer"
              >
                <option value={1}>P1 — Urgent</option>
                <option value={2}>P2 — High</option>
                <option value={3}>P3 — Normal</option>
                <option value={4}>P4 — Low</option>
              </select>
            </div>

            {/* Due date */}
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Calendar size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Due Date
                </span>
              </div>
              <input
                type="datetime-local"
                value={
                  task.due_at
                    ? new Date(task.due_at).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const newDue = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : undefined;
                  store.updateTask(task.id, { due_at: newDue });

                  const actorName = getUserById(currentUserId || "")?.name || "Someone";
                  notifyTaskUpdate(
                    task.assignee_id,
                    "task_updated",
                    `Due date updated: ${task.title}`,
                    newDue
                      ? `${actorName} set due date to ${new Date(newDue).toLocaleDateString()}`
                      : `${actorName} removed the due date`
                  );
                }}
                className="w-full px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 cursor-pointer"
              />
            </div>
          </div>

          {/* ── Task Group ── */}
          {groupProgress && (
            <>
              <div className="border-t border-gray-100" />
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers size={14} className={groupProgress.allDone ? "text-green-500" : "text-cyan-500"} />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Task Group
                  </span>
                  <span className={`text-xs font-bold ${groupProgress.allDone ? "text-green-600" : "text-cyan-600"}`}>
                    {groupProgress.done}/{groupProgress.total} done
                  </span>
                </div>

                {groupProgress.originalInput && (
                  <p className="text-sm text-gray-500 italic leading-relaxed">
                    &ldquo;{groupProgress.originalInput}&rdquo;
                  </p>
                )}

                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      groupProgress.allDone ? "bg-green-500" : "bg-cyan-500"
                    }`}
                    style={{ width: `${groupProgress.percent}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── Notes ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <StickyNote size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Notes
              </span>
              <span className="text-xs text-gray-300 font-semibold">
                ({task.notes.length})
              </span>
            </div>

            <div className="space-y-2 mb-3">
              {task.notes.map((note, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 bg-yellow-50 rounded-xl border border-yellow-100 group"
                >
                  <span className="flex-1 text-sm text-gray-700">{note}</span>
                  <button
                    onClick={() => store.removeNoteFromTask(task.id, i)}
                    className="p-1.5 sm:p-1 rounded text-gray-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Add a note..."
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-yellow-300"
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim()}
                className="p-2 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── File Attachments ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Files
              </span>
              <span className="text-xs text-gray-300 font-semibold">
                ({taskFiles.length})
              </span>
            </div>

            {loadingFiles ? (
              <div className="text-xs text-gray-300 py-3 text-center">
                Loading files...
              </div>
            ) : (
              <FileList
                files={taskFiles}
                onDelete={handleFileDelete}
                compact
                emptyMessage="No files attached"
              />
            )}

            {currentUserId && (
              <div className="mt-3">
                <FileUploadZone
                  uploadedBy={currentUserId}
                  taskId={task.id}
                  projectId={task.project_id}
                  onUploadComplete={handleFileUploaded}
                />
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── Drive Links ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Links
              </span>
              <span className="text-xs text-gray-300 font-semibold">
                ({task.drive_links.length})
              </span>
            </div>

            <div className="space-y-2 mb-3">
              {task.drive_links.map((link, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100 group"
                >
                  <ExternalLink
                    size={12}
                    className="text-blue-500 flex-shrink-0"
                  />
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                  >
                    {link}
                  </a>
                  <button
                    onClick={() => store.removeDriveLinkFromTask(task.id, i)}
                    className="p-1.5 sm:p-1 rounded text-gray-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLink()}
                placeholder="Paste a link..."
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              />
              <button
                onClick={addLink}
                disabled={!newLink.trim()}
                className="p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-gray-100" />

          {/* ── Meta ── */}
          <div className="text-xs text-gray-300 space-y-1">
            <p>
              Created by{" "}
              <span className="font-semibold text-gray-400">
                {createdBy?.name || "Unknown"}
              </span>{" "}
              via {task.created_via === "app_chat" ? "chat" : "manual"} ·{" "}
              {new Date(task.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p>
              Last updated{" "}
              {new Date(task.updated_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* ── Delete ── */}
          <div className="pt-2 pb-4">
            <button
              onClick={() => {
                store.deleteTask(task.id);
                onClose();
              }}
              className="w-full py-2.5 text-sm font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              Delete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
