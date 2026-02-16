"use client";

import { useSyncExternalStore, useCallback, useEffect, useState } from "react";
import { messagingStore } from "./messaging-store";
import { Channel, Message, ChannelMember, MessagesPanelView } from "@/types";

export function useChannels(userId: string) {
  const channels = useSyncExternalStore(
    (fn) => messagingStore.subscribeChannels(fn, userId),
    messagingStore.getChannels,
    messagingStore.getChannels
  );

  return {
    channels,
    createChannel: messagingStore.createChannel,
    getOrCreateDM: messagingStore.getOrCreateDM,
  };
}

export function useMessages(channelId: string | null, userId: string) {
  const messages = useSyncExternalStore(
    messagingStore.subscribeMessages,
    messagingStore.getMessages,
    messagingStore.getMessages
  );

  const loading = messagingStore.getMessagesLoading();
  const hasMore = messagingStore.getHasMore();

  useEffect(() => {
    if (channelId) {
      messagingStore.setActiveChannel(channelId, userId);
    }
    return () => {
      // Don't clean up on unmount — let it persist
    };
  }, [channelId, userId]);

  return {
    messages,
    loading,
    hasMore,
    loadMore: messagingStore.loadMoreMessages,
    sendMessage: useCallback(
      (body: string, replyTo?: string) => {
        if (!channelId) return Promise.resolve(null);
        return messagingStore.sendMessage(channelId, userId, body, replyTo);
      },
      [channelId, userId]
    ),
    editMessage: messagingStore.editMessage,
    deleteMessage: messagingStore.deleteMessage,
    toggleReaction: useCallback(
      (messageId: string, emoji: string) =>
        messagingStore.toggleReaction(messageId, userId, emoji),
      [userId]
    ),
  };
}

export function useChannelMembers(channelId: string | null) {
  const [members, setMembers] = useState<ChannelMember[]>([]);

  useEffect(() => {
    if (!channelId) {
      setMembers([]);
      return;
    }
    messagingStore.getChannelMembers(channelId).then(setMembers);
  }, [channelId]);

  return members;
}

export function useMessagesPanel() {
  const [view, setView] = useState<MessagesPanelView>({ kind: "list" });
  return { view, setView };
}
