"use client";

import { useSyncExternalStore, useState, useRef, useEffect } from "react";
import { notificationStore } from "@/lib/notifications";
import { Notification } from "@/types";
import {
  Bell,
  X,
  CheckCircle2,
  MessageSquare,
  UserPlus,
  Bot,
  Mail,
  Clock,
  Check,
} from "lucide-react";

interface NotificationBellProps {
  userId: string;
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const notifications = useSyncExternalStore(
    (fn) => notificationStore.subscribe(fn, userId),
    notificationStore.getNotifications,
    notificationStore.getNotifications
  );
  const unreadCount = notificationStore.getUnreadCount();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const typeIcon: Record<string, React.ReactNode> = {
    task_assigned: <UserPlus size={14} className="text-cyan-500" />,
    task_updated: <CheckCircle2 size={14} className="text-cyan-500" />,
    task_completed: <CheckCircle2 size={14} className="text-green-500" />,
    mention: <MessageSquare size={14} className="text-magenta-500" />,
    dm: <MessageSquare size={14} className="text-cyan-500" />,
    channel_message: <MessageSquare size={14} className="text-gray-500" />,
    checkin_due: <Clock size={14} className="text-yellow-500" />,
    agent_report: <Bot size={14} className="text-purple-500" />,
    email_ingested: <Mail size={14} className="text-orange-500" />,
  };

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-magenta-500 text-white text-xs font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[100]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => notificationStore.markAllAsRead(userId)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                >
                  <Check size={12} />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="py-8 text-center text-gray-400">
                <Bell size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            )}

            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => {
                  if (!notif.read_at) {
                    notificationStore.markAsRead(notif.id);
                  }
                  // Could navigate to notif.link here
                }}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                  !notif.read_at ? "bg-cyan-50/30" : ""
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {typeIcon[notif.type] || <Bell size={14} className="text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      !notif.read_at ? "font-semibold text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {notif.body}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {formatTime(notif.created_at)}
                  </span>
                  {!notif.read_at && (
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
