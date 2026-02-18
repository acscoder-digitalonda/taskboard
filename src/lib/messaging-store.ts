"use client";

import {
  Channel,
  ChannelMember,
  Message,
  MessageReaction,
  FileAttachment,
  User,
} from "@/types";
import { supabase } from "./supabase";

type Listener = () => void;

// ---- State ----
let channels: Channel[] = [];
let activeChannelId: string | null = null;
let messages: Message[] = []; // messages for activeChannelId
let messagesLoading = false;
let hasMoreMessages = true;
const PAGE_SIZE = 50;

const channelListeners = new Set<Listener>();
const messageListeners = new Set<Listener>();

function emitChannels() {
  channelListeners.forEach((fn) => fn());
}
function emitMessages() {
  messageListeners.forEach((fn) => fn());
}

// ---- Fetch Channels ----

async function fetchChannels(userId: string): Promise<Channel[]> {
  // Get channels the user is a member of
  const { data: memberRows, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id, last_read_at")
    .eq("user_id", userId);

  if (memErr) {
    console.error("Error fetching channel memberships:", memErr);
    return [];
  }
  if (!memberRows?.length) {
    return [];
  }

  const channelIds = memberRows.map((m) => m.channel_id);
  const lastReadMap = new Map(memberRows.map((m) => [m.channel_id, m.last_read_at]));

  const { data: channelRows, error: chErr } = await supabase
    .from("channels")
    .select("*")
    .in("id", channelIds)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (chErr) {
    console.error("Error fetching channels:", chErr);
    return [];
  }

  // Get last message for each channel
  const channelsWithMeta: Channel[] = [];
  for (const ch of channelRows || []) {
    const { data: lastMsg } = await supabase
      .from("messages")
      .select("*")
      .eq("channel_id", ch.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Count unread messages
    const lastRead = lastReadMap.get(ch.id) || ch.created_at;
    const { count: unreadCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("channel_id", ch.id)
      .is("deleted_at", null)
      .gt("created_at", lastRead);

    channelsWithMeta.push({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      type: ch.type,
      project_id: ch.project_id,
      created_by: ch.created_by,
      is_archived: ch.is_archived,
      created_at: ch.created_at,
      updated_at: ch.updated_at,
      last_message: lastMsg || null,
      unread_count: unreadCount || 0,
    });
  }

  return channelsWithMeta;
}

// ---- Fetch Messages (paginated) ----

async function fetchMessages(
  channelId: string,
  before?: string
): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return (data || []).reverse().map((m) => ({
    id: m.id,
    channel_id: m.channel_id,
    sender_id: m.sender_id,
    body: m.body,
    reply_to: m.reply_to,
    is_system: m.is_system,
    is_ai: m.is_ai,
    edited_at: m.edited_at,
    deleted_at: m.deleted_at,
    metadata: m.metadata || {},
    created_at: m.created_at,
  }));
}

// ---- Fetch files for messages ----

async function fetchFilesForMessages(messageIds: string[]): Promise<Map<string, FileAttachment[]>> {
  if (!messageIds.length) return new Map();
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .in("message_id", messageIds);

  if (error) {
    console.error("Error fetching files:", error);
    return new Map();
  }

  const map = new Map<string, FileAttachment[]>();
  for (const f of data || []) {
    const arr = map.get(f.message_id) || [];
    const { data: urlData } = supabase.storage
      .from("files")
      .getPublicUrl(f.storage_path);
    arr.push({
      id: f.id,
      name: f.name,
      storage_path: f.storage_path,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      uploaded_by: f.uploaded_by,
      channel_id: f.channel_id,
      message_id: f.message_id,
      task_id: f.task_id,
      project_id: f.project_id,
      created_at: f.created_at,
      url: urlData?.publicUrl,
    });
    map.set(f.message_id, arr);
  }
  return map;
}

// ---- Realtime ----

let messageChannel: ReturnType<typeof supabase.channel> | null = null;

function setupMessageRealtime(channelId: string, userId: string) {
  // Clean up previous subscription
  if (messageChannel) {
    supabase.removeChannel(messageChannel);
  }

  messageChannel = supabase
    .channel(`messages:${channelId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        const newMsg = payload.new as Message;
        // Avoid duplicates
        if (!messages.find((m) => m.id === newMsg.id)) {
          messages = [...messages, {
            id: newMsg.id,
            channel_id: newMsg.channel_id,
            sender_id: newMsg.sender_id,
            body: newMsg.body,
            reply_to: newMsg.reply_to,
            is_system: newMsg.is_system || false,
            is_ai: newMsg.is_ai || false,
            edited_at: newMsg.edited_at,
            deleted_at: newMsg.deleted_at,
            metadata: newMsg.metadata || {},
            created_at: newMsg.created_at,
          }];
          emitMessages();

          // Update last_read_at
          supabase
            .from("channel_members")
            .update({ last_read_at: new Date().toISOString() })
            .eq("channel_id", channelId)
            .eq("user_id", userId)
            .then(() => {});
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        const updated = payload.new as Message;
        messages = messages.map((m) =>
          m.id === updated.id
            ? { ...m, body: updated.body, edited_at: updated.edited_at, deleted_at: updated.deleted_at }
            : m
        );
        emitMessages();
      }
    )
    .subscribe();
}

// Also listen for new channels / channel updates globally
let channelRealtimeSub: ReturnType<typeof supabase.channel> | null = null;

function setupChannelRealtime(userId: string) {
  if (channelRealtimeSub) {
    supabase.removeChannel(channelRealtimeSub);
  }

  channelRealtimeSub = supabase
    .channel("channels-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "channels" },
      async () => {
        channels = await fetchChannels(userId);
        emitChannels();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      async () => {
        // Refresh channel list to update last_message and unread counts
        channels = await fetchChannels(userId);
        emitChannels();
      }
    )
    .subscribe();
}

// ---- Init ----

let initUserId: string | null = null;

async function initMessaging(userId: string) {
  if (initUserId === userId) return;
  initUserId = userId;
  try {
    channels = await fetchChannels(userId);
    emitChannels();
    setupChannelRealtime(userId);
  } catch (err) {
    console.error("Failed to init messaging:", err);
    initUserId = null; // Allow retry
  }
}

// ---- Store API ----

export const messagingStore = {
  // --- Channels ---
  getChannels: () => channels,
  getActiveChannelId: () => activeChannelId,

  subscribeChannels: (fn: Listener, userId: string) => {
    channelListeners.add(fn);
    initMessaging(userId).catch((err) =>
      console.error("Failed to init messaging:", err)
    );
    return () => channelListeners.delete(fn);
  },

  setActiveChannel: async (channelId: string | null, userId: string) => {
    activeChannelId = channelId;
    messages = [];
    hasMoreMessages = true;
    emitMessages();

    if (channelId) {
      messagesLoading = true;
      emitMessages();

      messages = await fetchMessages(channelId);
      hasMoreMessages = messages.length >= PAGE_SIZE;
      messagesLoading = false;
      emitMessages();

      setupMessageRealtime(channelId, userId);

      // Mark as read
      await supabase
        .from("channel_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", userId);
    }
  },

  loadMoreMessages: async () => {
    if (!activeChannelId || messagesLoading || !hasMoreMessages) return;
    messagesLoading = true;
    emitMessages();

    const oldest = messages[0]?.created_at;
    const older = await fetchMessages(activeChannelId, oldest);
    hasMoreMessages = older.length >= PAGE_SIZE;
    messages = [...older, ...messages];
    messagesLoading = false;
    emitMessages();
  },

  createChannel: async (
    name: string,
    type: "public" | "private",
    memberIds: string[],
    createdBy: string,
    projectId?: string
  ): Promise<Channel | null> => {
    const { data, error } = await supabase
      .from("channels")
      .insert({
        name,
        type,
        project_id: projectId || null,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating channel:", error);
      return null;
    }

    // Add all members including creator
    const allMembers = [...new Set([createdBy, ...memberIds])];
    const memberInserts = allMembers.map((uid) => ({
      channel_id: data.id,
      user_id: uid,
      role: uid === createdBy ? "owner" as const : "member" as const,
    }));

    await supabase.from("channel_members").insert(memberInserts);

    // Refresh channels
    channels = await fetchChannels(createdBy);
    emitChannels();

    const newChannel: Channel = {
      id: data.id,
      name: data.name,
      description: data.description,
      type: data.type,
      project_id: data.project_id,
      created_by: data.created_by,
      is_archived: data.is_archived,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
    return newChannel;
  },

  getOrCreateDM: async (userId1: string, userId2: string): Promise<Channel | null> => {
    // Check if DM already exists between these two users
    const { data: user1Channels } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId1);

    const { data: user2Channels } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId2);

    if (user1Channels && user2Channels) {
      const user1Ids = new Set(user1Channels.map((c) => c.channel_id));
      const commonIds = user2Channels
        .map((c) => c.channel_id)
        .filter((id) => user1Ids.has(id));

      if (commonIds.length > 0) {
        // Check if any of these common channels are direct messages with exactly 2 members
        for (const cid of commonIds) {
          const { data: ch } = await supabase
            .from("channels")
            .select("*")
            .eq("id", cid)
            .eq("type", "direct")
            .single();

          if (ch) {
            const { count } = await supabase
              .from("channel_members")
              .select("*", { count: "exact", head: true })
              .eq("channel_id", cid);

            if (count === 2) {
              return {
                id: ch.id,
                name: ch.name,
                description: ch.description,
                type: ch.type,
                project_id: ch.project_id,
                created_by: ch.created_by,
                is_archived: ch.is_archived,
                created_at: ch.created_at,
                updated_at: ch.updated_at,
              };
            }
          }
        }
      }
    }

    // Create new DM channel
    const { data, error } = await supabase
      .from("channels")
      .insert({
        name: null,
        type: "direct",
        created_by: userId1,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating DM:", error);
      return null;
    }

    await supabase.from("channel_members").insert([
      { channel_id: data.id, user_id: userId1, role: "member" },
      { channel_id: data.id, user_id: userId2, role: "member" },
    ]);

    channels = await fetchChannels(userId1);
    emitChannels();

    return {
      id: data.id,
      name: null,
      description: null,
      type: "direct",
      project_id: null,
      created_by: userId1,
      is_archived: false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  // --- Messages ---
  getMessages: () => messages,
  getMessagesLoading: () => messagesLoading,
  getHasMore: () => hasMoreMessages,

  subscribeMessages: (fn: Listener) => {
    messageListeners.add(fn);
    return () => messageListeners.delete(fn);
  },

  sendMessage: async (
    channelId: string,
    senderId: string,
    body: string,
    replyTo?: string,
    isAi?: boolean
  ): Promise<Message | null> => {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_id: senderId,
        body,
        reply_to: replyTo || null,
        is_ai: isAi || false,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error sending message:", error);
      return null;
    }

    // Update channel updated_at
    await supabase
      .from("channels")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", channelId);

    return {
      id: data.id,
      channel_id: data.channel_id,
      sender_id: data.sender_id,
      body: data.body,
      reply_to: data.reply_to,
      is_system: data.is_system,
      is_ai: data.is_ai,
      edited_at: data.edited_at,
      deleted_at: data.deleted_at,
      metadata: data.metadata || {},
      created_at: data.created_at,
    };
  },

  editMessage: async (messageId: string, newBody: string) => {
    messages = messages.map((m) =>
      m.id === messageId
        ? { ...m, body: newBody, edited_at: new Date().toISOString() }
        : m
    );
    emitMessages();

    const { error } = await supabase
      .from("messages")
      .update({ body: newBody, edited_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) console.error("Error editing message:", error);
  },

  deleteMessage: async (messageId: string) => {
    messages = messages.map((m) =>
      m.id === messageId
        ? { ...m, deleted_at: new Date().toISOString(), body: "[deleted]" }
        : m
    );
    emitMessages();

    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) console.error("Error deleting message:", error);
  },

  toggleReaction: async (messageId: string, userId: string, emoji: string) => {
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .single();

    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji });
    }
  },

  // --- Channel Members ---
  getChannelMembers: async (channelId: string): Promise<ChannelMember[]> => {
    const { data, error } = await supabase
      .from("channel_members")
      .select("*, users(*)")
      .eq("channel_id", channelId);

    if (error) {
      console.error("Error fetching members:", error);
      return [];
    }

    return (data || []).map((m) => ({
      id: m.id,
      channel_id: m.channel_id,
      user_id: m.user_id,
      role: m.role,
      last_read_at: m.last_read_at,
      muted: m.muted,
      joined_at: m.joined_at,
      user: m.users
        ? {
            id: m.users.id,
            name: m.users.name,
            color: m.users.color,
            initials: m.users.initials,
            email: m.users.email,
            avatar_url: m.users.avatar_url,
          }
        : undefined,
    }));
  },

  addMemberToChannel: async (channelId: string, userId: string) => {
    const { error } = await supabase
      .from("channel_members")
      .insert({ channel_id: channelId, user_id: userId });
    if (error) console.error("Error adding member:", error);
  },

  // --- Cleanup ---
  cleanup: () => {
    if (messageChannel) supabase.removeChannel(messageChannel);
    if (channelRealtimeSub) supabase.removeChannel(channelRealtimeSub);
    messageChannel = null;
    channelRealtimeSub = null;
    initUserId = null;
    channels = [];
    messages = [];
    activeChannelId = null;
  },
};
