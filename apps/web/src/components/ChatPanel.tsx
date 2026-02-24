"use client";

import { useState, useRef, useEffect } from "react";
import { parseTaskInput, store } from "@/lib/store";
import { useUsers, useProjects } from "@/lib/hooks";
import { apiFetch } from "@/lib/api-client";
import { getUserById, getProjectById } from "@/lib/utils";
import { Task, TaskStatus } from "@/types";
import {
  Send,
  Bot,
  User,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Bell,
  Phone,
  BellOff,
  Loader2,
  Sparkles,
  Layers,
} from "lucide-react";

type NotifyLevel = "in_app" | "whatsapp" | "none";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  taskPreviews?: Partial<Task>[];
  isThinking?: boolean;
}

interface ChatPanelProps {
  currentUserId: string;
  aiConnected?: boolean | null;
}

export default function ChatPanel({ currentUserId, aiConnected: aiConnectedProp }: ChatPanelProps) {
  const users = useUsers();
  const { projects } = useProjects();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Hey! Type a task and I'll create it. Try: \"Review deck, draft proposal, and schedule meeting with Katie — assign to An, due tomorrow\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingTasks, setPendingTasks] = useState<Partial<Task>[]>([]);
  const [originalInput, setOriginalInput] = useState("");
  const [notifyLevel, setNotifyLevel] = useState<NotifyLevel>("in_app");
  const [isCreating, setIsCreating] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiConnectedLocal, setAiConnectedLocal] = useState<boolean | null>(null);
  const aiConnected = aiConnectedProp ?? aiConnectedLocal;
  const [isOpen, setIsOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if any pending task is assigned to someone else
  const hasCrossAssignment = pendingTasks.some(
    (t) => t.assignee_id && t.assignee_id !== currentUserId
  );

  async function handleSend() {
    if (!input.trim() || aiParsing) return;
    const text = input.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      text,
    };

    const thinkingId = "thinking-" + Date.now();
    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: "bot",
      text: "Parsing your task...",
      isThinking: true,
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setAiParsing(true);

    try {
      const res = await apiFetch("/api/chat/parse", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          users: users.map((u) => ({ id: u.id, name: u.name, role: u.role, description: u.description })),
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
        }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();

      if (data.success && data.parsed) {
        setAiConnectedLocal(true);
        const parsedArray: Partial<Task>[] = Array.isArray(data.parsed)
          ? data.parsed
          : [data.parsed];

        // Apply defaults to each task
        const tasks = parsedArray.map((p: Partial<Task>) => ({
          ...p,
          assignee_id: p.assignee_id || currentUserId,
          status: p.status || "doing",
          priority: p.priority || 3,
        }));

        const confidence = data.confidence ?? 0;
        const confidenceLabel =
          confidence >= 0.8
            ? "High confidence"
            : confidence >= 0.5
              ? "Medium confidence"
              : "Low confidence";

        const taskLabel = tasks.length === 1
          ? "Here's what I've got"
          : `I found ${tasks.length} tasks`;

        const botMsg: ChatMessage = {
          id: "bot-" + Date.now(),
          role: "bot",
          text: `✨ ${taskLabel} (${confidenceLabel}):`,
          taskPreviews: tasks,
        };

        setMessages((prev) =>
          prev.filter((m) => m.id !== thinkingId).concat(botMsg)
        );
        setPendingTasks(tasks);
        setOriginalInput(text);
        setNotifyLevel(
          tasks.some((t: Partial<Task>) => t.assignee_id !== currentUserId) ? "whatsapp" : "in_app"
        );
      } else {
        throw new Error("Parse failed");
      }
    } catch {
      // Fallback to regex parser
      setAiConnectedLocal(false);
      const parsed = parseTaskInput(text);
      if (!parsed.assignee_id) parsed.assignee_id = currentUserId;
      if (!parsed.status) parsed.status = "doing";
      if (!parsed.priority) parsed.priority = 2;

      const botMsg: ChatMessage = {
        id: "bot-" + Date.now(),
        role: "bot",
        text: "Here's what I've got (basic parsing — AI unavailable):",
        taskPreviews: [parsed],
      };

      setMessages((prev) =>
        prev.filter((m) => m.id !== thinkingId).concat(botMsg)
      );
      setPendingTasks([parsed]);
      setOriginalInput(text);
      setNotifyLevel(
        parsed.assignee_id !== currentUserId ? "whatsapp" : "in_app"
      );
    } finally {
      setAiParsing(false);
    }
  }

  async function handleCreate() {
    if (pendingTasks.length === 0 || isCreating) return;
    setIsCreating(true);

    // Create group if multiple tasks
    let groupId: string | undefined;
    if (pendingTasks.length > 1) {
      const group = store.addTaskGroup(
        originalInput,
        currentUserId,
        "app_chat",
        pendingTasks.length
      );
      groupId = group.id;
    }

    // Create each task
    const createdTasks: Task[] = [];
    for (const pt of pendingTasks) {
      const task = store.addTask({
        title: pt.title || "Untitled task",
        assignee_id: pt.assignee_id || currentUserId,
        project_id: pt.project_id,
        status: (pt.status as TaskStatus) || "doing",
        priority: pt.priority || 2,
        due_at: pt.due_at,
        created_by_id: currentUserId,
        created_via: "app_chat",
        drive_links: pt.drive_links || [],
        notes: pt.notes || [],
        sections: pt.sections || [],
        checkin_target_id: pt.checkin_target_id,
        group_id: groupId,
      });
      createdTasks.push(task);
    }

    // Send notifications for cross-assigned tasks
    if (notifyLevel !== "none") {
      const crossAssigned = createdTasks.filter(
        (t) => t.assignee_id !== currentUserId
      );
      for (const task of crossAssigned) {
        try {
          await apiFetch("/api/notifications/send", {
            method: "POST",
            body: JSON.stringify({
              user_id: task.assignee_id,
              type: "task_assigned",
              title: `New task from ${getUserById(currentUserId)?.name || "someone"}`,
              body: task.title,
              link: `/tasks/${task.id}`,
              reference_id: task.id,
              reference_type: "task",
              priority: task.priority,
            }),
          });
        } catch (err) {
          console.error("Failed to send notification:", err);
        }
      }
    }

    // Build confirmation message
    let notifyLabel = "";
    if (notifyLevel === "whatsapp") notifyLabel = " 📱 WhatsApp notified.";
    else if (notifyLevel === "in_app") notifyLabel = " 🔔 Notification sent.";

    const confirmText = createdTasks.length === 1
      ? `✅ Created "${createdTasks[0].title}" and assigned to ${getUserById(createdTasks[0].assignee_id)?.name || "Unknown"}.${notifyLabel} Ready for another!`
      : `✅ Created ${createdTasks.length} tasks.${notifyLabel} Ready for another!`;

    const confirmMsg: ChatMessage = {
      id: "confirm-" + Date.now(),
      role: "bot",
      text: confirmText,
    };

    setMessages((prev) => [...prev, confirmMsg]);
    setPendingTasks([]);
    setOriginalInput("");
    setIsCreating(false);
  }

  function handleCancel() {
    const cancelMsg: ChatMessage = {
      id: "cancel-" + Date.now(),
      role: "bot",
      text: "Cancelled. Type another task whenever you're ready.",
    };
    setMessages((prev) => [...prev, cancelMsg]);
    setPendingTasks([]);
    setOriginalInput("");
  }

  return (
    <div className="flex flex-col bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-500 to-magenta-500 text-white"
        style={{
          background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={18} />
          <span className="font-bold text-sm">Quick Task</span>
          <Sparkles size={12} className="opacity-70" />
          {aiConnected !== null && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                aiConnected
                  ? "bg-white/20 text-white/90"
                  : "bg-yellow-400/30 text-yellow-100"
              }`}
              title={aiConnected ? "Claude Sonnet connected" : "AI unavailable — using basic parser"}
            >
              {aiConnected ? "AI" : "Basic"}
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {isOpen && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px] min-h-[200px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                    {msg.isThinking ? (
                      <Loader2
                        size={14}
                        className="text-cyan-600 animate-spin"
                      />
                    ) : (
                      <Bot size={14} className="text-cyan-600" />
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-gray-900 text-white rounded-2xl rounded-br-md px-4 py-2"
                      : "bg-gray-50 text-gray-800 rounded-2xl rounded-bl-md px-4 py-2"
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>

                  {/* Multi-task preview cards */}
                  {msg.taskPreviews && msg.taskPreviews.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.taskPreviews.map((preview, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-white rounded-xl border border-gray-200 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            {/* Index badge for multi-task */}
                            {msg.taskPreviews!.length > 1 && (
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {idx + 1}
                              </span>
                            )}
                            <p className="font-bold text-sm text-gray-900 flex-1">
                              {preview.title}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {preview.assignee_id && (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                                style={{
                                  backgroundColor:
                                    getUserById(preview.assignee_id)?.color || "#999",
                                }}
                              >
                                {getUserById(preview.assignee_id)?.name}
                              </span>
                            )}
                            {preview.project_id && (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                style={{
                                  backgroundColor:
                                    (getProjectById(preview.project_id)?.color || "#999") + "20",
                                  color:
                                    getProjectById(preview.project_id)?.color || "#999",
                                }}
                              >
                                {getProjectById(preview.project_id)?.name}
                              </span>
                            )}
                            {preview.due_at && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                Due: {new Date(preview.due_at).toLocaleDateString()}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">
                              {preview.status || "doing"}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Action bar — shown once below all previews */}
                      {pendingTasks.length > 0 && (
                        <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
                          {/* Group badge for multi-task */}
                          {pendingTasks.length > 1 && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Layers size={10} className="text-cyan-500" />
                              <span className="font-medium">
                                {pendingTasks.length} tasks will be grouped together
                              </span>
                            </div>
                          )}

                          {/* Notification level selector */}
                          {hasCrossAssignment && (
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-xs font-semibold text-gray-500 mb-1.5">
                                Notify assignees:
                              </p>
                              <div className="flex gap-1">
                                {(
                                  [
                                    {
                                      level: "whatsapp" as NotifyLevel,
                                      icon: Phone,
                                      label: "WhatsApp",
                                      color: "bg-green-50 text-green-700 border-green-200",
                                    },
                                    {
                                      level: "in_app" as NotifyLevel,
                                      icon: Bell,
                                      label: "In-app",
                                      color: "bg-cyan-50 text-cyan-700 border-cyan-200",
                                    },
                                    {
                                      level: "none" as NotifyLevel,
                                      icon: BellOff,
                                      label: "None",
                                      color: "bg-gray-50 text-gray-500 border-gray-200",
                                    },
                                  ] as const
                                ).map(({ level, icon: Icon, label, color }) => (
                                  <button
                                    key={level}
                                    onClick={() => setNotifyLevel(level)}
                                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-all ${
                                      notifyLevel === level
                                        ? `${color} ring-2 ring-offset-1 ${level === "whatsapp" ? "ring-green-300" : level === "in_app" ? "ring-cyan-300" : "ring-gray-300"}`
                                        : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                                    }`}
                                  >
                                    <Icon size={11} />
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2 border-t border-gray-100">
                            <button
                              onClick={handleCreate}
                              disabled={isCreating}
                              className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white text-xs font-bold rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
                            >
                              <Check size={12} />
                              {isCreating
                                ? "Creating..."
                                : pendingTasks.length === 1
                                  ? "Create"
                                  : `Create ${pendingTasks.length} tasks`}
                            </button>
                            <button
                              onClick={handleCancel}
                              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              <X size={12} />
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-white" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a task... e.g. &quot;Review deck, draft proposal, schedule meeting&quot;"
                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 transition-all"
                disabled={aiParsing}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || aiParsing}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {aiParsing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
