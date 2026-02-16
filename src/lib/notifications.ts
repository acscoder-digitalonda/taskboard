"use client";

import { Notification } from "@/types";
import { supabase } from "./supabase";

type Listener = () => void;

let notifications: Notification[] = [];
let unreadCount = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

// ---- Fetch ----

async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }

  return (data || []).map((n) => ({
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read_at: n.read_at,
    channel: n.channel,
    delivered_at: n.delivered_at,
    reference_id: n.reference_id,
    reference_type: n.reference_type,
    created_at: n.created_at,
  }));
}

// ---- Realtime ----

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
        notifications = [newNotif, ...notifications];
        unreadCount = notifications.filter((n) => !n.read_at).length;
        emit();
      }
    )
    .subscribe();
}

// ---- Init ----

let initUserId: string | null = null;

async function initNotifications(userId: string) {
  if (initUserId === userId) return;
  initUserId = userId;
  notifications = await fetchNotifications(userId);
  unreadCount = notifications.filter((n) => !n.read_at).length;
  emit();
  setupNotifRealtime(userId);
}

// ---- Store ----

export const notificationStore = {
  getNotifications: () => notifications,
  getUnreadCount: () => unreadCount,

  subscribe: (fn: Listener, userId: string) => {
    listeners.add(fn);
    initNotifications(userId);
    return () => listeners.delete(fn);
  },

  markAsRead: async (notifId: string) => {
    notifications = notifications.map((n) =>
      n.id === notifId ? { ...n, read_at: new Date().toISOString() } : n
    );
    unreadCount = notifications.filter((n) => !n.read_at).length;
    emit();

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notifId);
  },

  markAllAsRead: async (userId: string) => {
    const now = new Date().toISOString();
    notifications = notifications.map((n) =>
      !n.read_at ? { ...n, read_at: now } : n
    );
    unreadCount = 0;
    emit();

    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
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
    initUserId = null;
    notifications = [];
    unreadCount = 0;
  },
};
