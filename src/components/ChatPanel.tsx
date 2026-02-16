"use client";

import { useState, useRef, useEffect } from "react";
import { parseTaskInput, store } from "@/lib/store";
import { getUserById, getProjectById } from "@/lib/utils";
import { Task, TaskStatus } from "@/types";
import {
  Send,
  Bot,
  User,
  Edit3,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  taskPreview?: Partial<Task>;
}

interface ChatPanelProps {
  currentUserId: string;
}

export default function ChatPanel({ currentUserId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Hey! Type a task and I'll create it. Try: \"Draft proposal for ACME, assign to Katie, due tomorrow, project Partnerships\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingTask, setPendingTask] = useState<Partial<Task> | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      text: input.trim(),
    };

    const parsed = parseTaskInput(input.trim());

    // Set defaults
    if (!parsed.assignee_id) parsed.assignee_id = currentUserId;
    if (!parsed.status) parsed.status = "doing";
    if (!parsed.priority) parsed.priority = 2;

    const botMsg: ChatMessage = {
      id: "bot-" + Date.now(),
      role: "bot",
      text: "Here's what I've got:",
      taskPreview: parsed,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setPendingTask(parsed);
    setInput("");
  }

  function handleCreate() {
    if (!pendingTask) return;

    const task = store.addTask({
      title: pendingTask.title || "Untitled task",
      assignee_id: pendingTask.assignee_id || currentUserId,
      project_id: pendingTask.project_id,
      status: (pendingTask.status as TaskStatus) || "doing",
      priority: pendingTask.priority || 2,
      due_at: pendingTask.due_at,
      created_by_id: currentUserId,
      created_via: "app_chat",
      drive_links: pendingTask.drive_links || [],
      notes: pendingTask.notes || [],
      sections: pendingTask.sections || [],
      checkin_target_id: pendingTask.checkin_target_id,
    });

    const confirmMsg: ChatMessage = {
      id: "confirm-" + Date.now(),
      role: "bot",
      text: `✅ Created "${task.title}" and assigned to ${
        getUserById(task.assignee_id)?.name
      }. Ready for another!`,
    };

    setMessages((prev) => [...prev, confirmMsg]);
    setPendingTask(null);
  }

  function handleCancel() {
    const cancelMsg: ChatMessage = {
      id: "cancel-" + Date.now(),
      role: "bot",
      text: "Cancelled. Type another task whenever you're ready.",
    };
    setMessages((prev) => [...prev, cancelMsg]);
    setPendingTask(null);
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
                    <Bot size={14} className="text-cyan-600" />
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

                  {/* Task preview card */}
                  {msg.taskPreview && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200 space-y-2">
                      <p className="font-bold text-sm text-gray-900">
                        {msg.taskPreview.title}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        {msg.taskPreview.assignee_id && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                            style={{
                              backgroundColor:
                                getUserById(msg.taskPreview.assignee_id)
                                  ?.color || "#999",
                            }}
                          >
                            {getUserById(msg.taskPreview.assignee_id)?.name}
                          </span>
                        )}
                        {msg.taskPreview.project_id && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor:
                                (getProjectById(msg.taskPreview.project_id)
                                  ?.color || "#999") + "20",
                              color:
                                getProjectById(msg.taskPreview.project_id)
                                  ?.color || "#999",
                            }}
                          >
                            {getProjectById(msg.taskPreview.project_id)?.name}
                          </span>
                        )}
                        {msg.taskPreview.due_at && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            Due:{" "}
                            {new Date(
                              msg.taskPreview.due_at
                            ).toLocaleDateString()}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">
                          {msg.taskPreview.status || "doing"}
                        </span>
                      </div>

                      {pendingTask && (
                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={handleCreate}
                            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white text-xs font-bold rounded-lg hover:bg-cyan-600 transition-colors"
                          >
                            <Check size={12} />
                            Create
                          </button>
                          <button
                            onClick={handleCancel}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            <X size={12} />
                            Cancel
                          </button>
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
                placeholder="Type a task... e.g. &quot;Review deck, assign to An, due tomorrow&quot;"
                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
