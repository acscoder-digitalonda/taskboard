"use client";

import { useChannels } from "@/lib/messaging-hooks";
import { useUsers } from "@/lib/hooks";
import { Channel, ChannelMember, User } from "@/types";
import { Hash, Lock, MessageSquare, Plus, Users, Search, PenSquare } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { messagingStore } from "@/lib/messaging-store";

interface ChannelListProps {
  userId: string;
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onNewChannel: () => void;
  onNewDM: () => void;
}

export default function ChannelList({
  userId,
  activeChannelId,
  onSelectChannel,
  onNewChannel,
  onNewDM,
}: ChannelListProps) {
  const { channels } = useChannels(userId);
  const users = useUsers();
  const [search, setSearch] = useState("");

  // Fetch members for DM channels to resolve names
  const [dmMemberMap, setDmMemberMap] = useState<Map<string, ChannelMember[]>>(new Map());

  useEffect(() => {
    const dmChannels = channels.filter((c) => c.type === "direct");
    if (dmChannels.length === 0) return;

    Promise.all(
      dmChannels.map(async (ch) => {
        const members = await messagingStore.getChannelMembers(ch.id);
        return [ch.id, members] as [string, ChannelMember[]];
      })
    ).then((entries) => {
      setDmMemberMap(new Map(entries));
    });
  }, [channels]);

  function getDMName(channel: Channel): string {
    const members = dmMemberMap.get(channel.id);
    if (members) {
      const other = members.find((m) => m.user_id !== userId);
      if (other?.user?.name) return other.user.name;
    }
    // Fallback: check last_message sender
    if (channel.last_message?.sender_id) {
      const sender = users.find((u) => u.id === channel.last_message?.sender_id);
      if (sender && sender.id !== userId) return sender.name;
    }
    if (channel.name) return channel.name;
    return "Direct Message";
  }

  function getDMUser(channel: Channel): User | undefined {
    const members = dmMemberMap.get(channel.id);
    if (members) {
      const other = members.find((m) => m.user_id !== userId);
      if (other?.user) return other.user;
    }
    if (channel.last_message?.sender_id) {
      const sender = users.find((u) => u.id === channel.last_message?.sender_id);
      if (sender && sender.id !== userId) return sender;
    }
    return undefined;
  }

  const publicChannels = useMemo(
    () => channels.filter((c) => c.type === "public" || c.type === "private"),
    [channels]
  );
  const dmChannels = useMemo(
    () => channels.filter((c) => c.type === "direct"),
    [channels]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return { publicChannels, dmChannels };
    const q = search.toLowerCase();
    return {
      publicChannels: publicChannels.filter(
        (c) => c.name?.toLowerCase().includes(q)
      ),
      dmChannels: dmChannels.filter((c) => {
        const otherName = getDMName(c);
        return otherName.toLowerCase().includes(q);
      }),
    };
  }, [search, publicChannels, dmChannels, userId, users, dmMemberMap]);

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Messages</h2>
          <div className="flex gap-1">
            <button
              onClick={onNewChannel}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-cyan-600 transition-colors"
              title="New channel"
            >
              <Hash size={16} />
            </button>
            <button
              onClick={onNewDM}
              className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors"
              title="New message"
            >
              <PenSquare size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
          />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-100 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none"
          />
        </div>
      </div>

      {/* Channel groups */}
      <div className="flex-1 overflow-y-auto">
        {/* Channels */}
        {filtered.publicChannels.length > 0 && (
          <div className="py-2">
            <div className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Hash size={12} />
              Channels
            </div>
            {filtered.publicChannels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                label={ch.name || "Unnamed"}
                icon={ch.type === "private" ? <Lock size={14} /> : <Hash size={14} />}
                time={ch.last_message ? formatTime(ch.last_message.created_at) : ""}
                preview={ch.last_message?.body?.startsWith("__file:") ? "📎 File" : ch.last_message?.body?.replace(/__file:\{.*\}$/, "").trim() || ""}
                unread={ch.unread_count || 0}
                onClick={() => onSelectChannel(ch.id)}
              />
            ))}
          </div>
        )}

        {/* DMs */}
        {filtered.dmChannels.length > 0 && (
          <div className="py-2">
            <div className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={12} />
              Direct Messages
            </div>
            {filtered.dmChannels.map((ch) => {
              const dmUser = getDMUser(ch);
              return (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  isActive={ch.id === activeChannelId}
                  label={getDMName(ch)}
                  icon={
                    dmUser ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: dmUser.color }}
                      >
                        {dmUser.avatar_url ? (
                          <img src={dmUser.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          dmUser.initials
                        )}
                      </div>
                    ) : (
                      <MessageSquare size={14} />
                    )
                  }
                  time={ch.last_message ? formatTime(ch.last_message.created_at) : ""}
                  preview={ch.last_message?.body?.startsWith("__file:") ? "📎 File" : ch.last_message?.body || ""}
                  unread={ch.unread_count || 0}
                  onClick={() => onSelectChannel(ch.id)}
                />
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {channels.length === 0 && (
          <div className="p-6 text-center text-gray-400">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs mt-1">
              Create a channel or start a direct message
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Channel Row ----

function ChannelRow({
  channel,
  isActive,
  label,
  icon,
  time,
  preview,
  unread,
  onClick,
}: {
  channel: Channel;
  isActive: boolean;
  label: string;
  icon: React.ReactNode;
  time: string;
  preview: string;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
        isActive
          ? "bg-cyan-50 border-l-2 border-cyan-500"
          : "hover:bg-gray-50 border-l-2 border-transparent"
      }`}
    >
      <div
        className={`mt-0.5 flex-shrink-0 ${
          isActive ? "text-cyan-600" : "text-gray-400"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm font-semibold truncate ${
              unread > 0 ? "text-gray-900" : "text-gray-700"
            }`}
          >
            {label}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
        </div>
        {preview && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{preview}</p>
        )}
      </div>
      {unread > 0 && (
        <div className="flex-shrink-0 mt-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 text-white text-xs font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        </div>
      )}
    </button>
  );
}
