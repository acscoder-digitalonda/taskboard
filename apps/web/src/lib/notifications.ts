"use client";

import { Notification } from "@/types";
import { apiFetch } from "./api-client";
import { supabase } from "./supabase";

type Listener = () => void;

let notifications: Notification[] = [];
let unreadCount = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

// ---- Browser/PWA notification ----

function showBrowserNotification(notif: Notification) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (window.Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: notif.body || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: notif.id, // prevents duplicates
    data: { link: notif.link },
  };

  // Use service worker notification (works in PWA background)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(notif.title, options);
    });
  } else {
    // Fallback: basic browser notification
    new window.Notification(notif.title, options);
  }
}

// ---- Fetch (via server API — bypasses RLS) ----

async function fetchNotifications(userId: string): Promise<Notification[]> {
  try {
    const res = await apiFetch("/api/notifications");
    if (!res.ok) {
      console.error("fetchNotifications: API returned", res.status);
      return [];
    }
    const { notifications: data } = await res.json();
    return (data || []) as Notification[];
  } catch (err) {
    console.error("fetchNotifications error:", err);
    return [];
  }
}

// ---- Realtime (best-effort, polling covers failures) ----

let notifChannel: ReturnType<typeof supabase.channel> | null = null;

function setupNotifRealtime(userId: string) {
  if (notifChannel) supabase.removeChannel(notifChannel);

  notifChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotif = payload.new as Notification;
        // Deduplicate — the notification might already exist from addLocalNotification
        if (!notifications.some((n) => n.id === newNotif.id)) {
          notifications = [newNotif, ...notifications];
          unreadCount = notifications.filter((n) => !n.read_at).length;
          emit();
          // Show browser/PWA notification
          showBrowserNotification(newNotif);
        }
      }
    )
    .subscribe();
}

// ---- Polling fallback (catches anything realtime misses) ----

let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling(userId: string) {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    try {
      const fresh = await fetchNotifications(userId);
      if (fresh.length === 0 && notifications.length === 0) return;

      // Check if there are any new notifications we don't have locally
      const localIds = new Set(notifications.map((n) => n.id));
      const hasNew = fresh.some((n) => !localIds.has(n.id));
      // Check if any read_at status changed (e.g., marked read on another device)
      const hasReadChanges = fresh.some((n) => {
        const local = notifications.find((l) => l.id === n.id);
        return local && local.read_at !== n.read_at;
      });

      if (hasNew || hasReadChanges || fresh.length !== notifications.length) {
        notifications = fresh;
        unreadCount = fresh.filter((n) => !n.read_at).length;
        emit();
      }
    } catch {
      // Silent — polling is a fallback, don't spam errors
    }
  }, 30_000); // Every 30 seconds
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ---- Init ----

let initUserId: string | null = null;

async function initNotifications(userId: string) {
  if (initUserId === userId) return;
  initUserId = userId;
  try {
    notifications = await fetchNotifications(userId);
    unreadCount = notifications.filter((n) => !n.read_at).length;
    emit();
    setupNotifRealtime(userId);
    startPolling(userId);
  } catch (err) {
    console.error("Failed to init notifications:", err);
    initUserId = null; // Allow retry
  }
}

// ---- Store ----

export const notificationStore = {
  getNotifications: () => notifications,
  getUnreadCount: () => unreadCount,

  subscribe: (fn: Listener, userId: string) => {
    listeners.add(fn);
    initNotifications(userId).catch((err) =>
      console.error("Failed to init notifications:", err)
    );
    return () => listeners.delete(fn);
  },

  /**
   * Instantly add a notification to the local store.
   * Called by ChatPanel/TaskDetailDrawer after successfully creating
   * a notification via the API — provides instant bell badge update
   * without waiting for realtime or polling.
   */
  addLocalNotification: (notif: Notification) => {
    // Deduplicate
    if (notifications.some((n) => n.id === notif.id)) return;
    notifications = [notif, ...notifications];
    unreadCount = notifications.filter((n) => !n.read_at).length;
    emit();
  },

  markAsRead: async (notifId: string) => {
    // Optimistic local update
    notifications = notifications.map((n) =>
      n.id === notifId ? { ...n, read_at: new Date().toISOString() } : n
    );
    unreadCount = notifications.filter((n) => !n.read_at).length;
    emit();

    // Persist via server API (bypasses RLS)
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ notification_id: notifId }),
      });
    } catch (err) {
      console.error("markAsRead API error:", err);
    }
  },

  markAllAsRead: async (userId: string) => {
    const now = new Date().toISOString();
    notifications = notifications.map((n) =>
      !n.read_at ? { ...n, read_at: now } : n
    );
    unreadCount = 0;
    emit();

    // Persist via server API (bypasses RLS)
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ mark_all: true }),
      });
    } catch (err) {
      console.error("markAllAsRead API error:", err);
    }
  },

  // Create a notification (called by API routes or OpenClaw)
  createNotification: async (notif: Omit<Notification, "id" | "created_at" | "delivered_at" | "read_at">) => {
    const { error } = await supabase.from("notifications").insert({
      user_id: notif.user_id,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      link: notif.link,
      channel: notif.channel,
      reference_id: notif.reference_id,
      reference_type: notif.reference_type,
    });
    if (error) console.error("Error creating notification:", error);
  },

  cleanup: () => {
    if (notifChannel) supabase.removeChannel(notifChannel);
    notifChannel = null;
    stopPolling();
    initUserId = null;
    notifications = [];
    unreadCount = 0;
  },
};
