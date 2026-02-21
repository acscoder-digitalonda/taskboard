"use client";

import { useState } from "react";
import { useUsers } from "@/lib/hooks";
import { useProjects } from "@/lib/hooks";
import { messagingStore } from "@/lib/messaging-store";
import { ArrowLeft, Hash, Lock, Check } from "lucide-react";

interface NewChannelFormProps {
  userId: string;
  onCreated: (channelId: string) => void;
  onCancel: () => void;
}

export default function NewChannelForm({ userId, onCreated, onCancel }: NewChannelFormProps) {
  const users = useUsers();
  const { projects } = useProjects();
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const otherUsers = users.filter((u) => u.id !== userId);

  const toggleMember = (uid: string) => {
    const next = new Set(selectedMembers);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    setSelectedMembers(next);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);

    const channel = await messagingStore.createChannel(
      name.trim(),
      isPrivate ? "private" : "public",
      Array.from(selectedMembers),
      userId,
      selectedProject || undefined
    );

    setCreating(false);
    if (channel) {
      onCreated(channel.id);
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
        <h3 className="text-sm font-bold text-gray-900">Create Channel</h3>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Channel name */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Channel Name
          </label>
          <div className="relative">
            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. marketing-q1"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Privacy toggle */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Privacy
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setIsPrivate(false)}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                !isPrivate
                  ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Hash size={14} />
              Public
            </button>
            <button
              onClick={() => setIsPrivate(true)}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                isPrivate
                  ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Lock size={14} />
              Private
            </button>
          </div>
        </div>

        {/* Link to project (optional) */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Project (optional)
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none bg-white"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Add members */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Members
          </label>
          <div className="space-y-1">
            {otherUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => toggleMember(user.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  selectedMembers.has(user.id)
                    ? "bg-cyan-50 border border-cyan-200"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                  style={{ backgroundColor: user.color }}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={`${user.name} avatar`} className="w-full h-full object-cover" />
                  ) : (
                    user.initials
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                  {user.name}
                </span>
                {selectedMembers.has(user.id) && (
                  <Check size={16} className="text-cyan-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          {creating ? "Creating..." : "Create Channel"}
        </button>
      </div>
    </div>
  );
}
