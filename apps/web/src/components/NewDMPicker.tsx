"use client";

import { useState } from "react";
import { useUsers } from "@/lib/hooks";
import { messagingStore } from "@/lib/messaging-store";
import { ArrowLeft, Search, MessageSquare } from "lucide-react";

interface NewDMPickerProps {
  userId: string;
  onSelect: (channelId: string) => void;
  onCancel: () => void;
}

export default function NewDMPicker({ userId, onSelect, onCancel }: NewDMPickerProps) {
  const users = useUsers();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const otherUsers = users.filter((u) => u.id !== userId);
  const filtered = search.trim()
    ? otherUsers.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase())
      )
    : otherUsers;

  const handleSelect = async (targetUserId: string) => {
    setLoading(targetUserId);
    const dm = await messagingStore.getOrCreateDM(userId, targetUserId);
    setLoading(null);
    if (dm) {
      onSelect(dm.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
        >
          <ArrowLeft size={18} />
        </button>
        <h3 className="text-sm font-bold text-gray-900">New Message</h3>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
          />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-gray-400">
            <p className="text-sm">No users found</p>
          </div>
        )}
        {filtered.map((user) => (
          <button
            key={user.id}
            onClick={() => handleSelect(user.id)}
            disabled={loading !== null}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
              style={{ backgroundColor: user.color }}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={`${user.name} avatar`} className="w-full h-full object-cover" />
              ) : (
                user.initials
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              {user.email && (
                <p className="text-xs text-gray-400">{user.email}</p>
              )}
            </div>
            {loading === user.id ? (
              <div className="w-5 h-5 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
            ) : (
              <MessageSquare size={16} className="text-gray-300" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
