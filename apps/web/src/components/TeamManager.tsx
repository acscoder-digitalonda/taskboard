"use client";

import { useState, useEffect } from "react";
import { useUsers } from "@/lib/hooks";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { supabase } from "@/lib/supabase";
import { UserRole } from "@/types";
import { Users, X, Edit3, Check, Sparkles, AlertTriangle, Bell, BellOff } from "lucide-react";

interface TeamManagerProps {
  onClose: () => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: "development", label: "Development", description: "Code, bugs, deployment, API" },
  { value: "design", label: "Design", description: "UI/UX, mockups, branding" },
  { value: "strategy", label: "Strategy", description: "Research, planning, positioning" },
  { value: "pm", label: "PM", description: "Scheduling, coordination, budgets" },
  { value: "content_writer", label: "Content Writer", description: "Blog, copy, social media" },
  { value: "member", label: "Member", description: "General (no specialty)" },
];

const ROLE_COLORS: Record<string, string> = {
  development: "bg-blue-100 text-blue-700",
  design: "bg-purple-100 text-purple-700",
  strategy: "bg-orange-100 text-orange-700",
  pm: "bg-cyan-100 text-cyan-700",
  content_writer: "bg-pink-100 text-pink-700",
  member: "bg-gray-100 text-gray-500",
};

export default function TeamManager({ onClose }: TeamManagerProps) {
  const { users, updateUser } = useUsers();

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Focus trap
  const trapRef = useFocusTrap<HTMLDivElement>();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("member");
  const [editDescription, setEditDescription] = useState("");

  // Track which users have push subscriptions
  const [pushUsers, setPushUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadPushStatus() {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("user_id");
      if (data) {
        setPushUsers(new Set(data.map((d: { user_id: string }) => d.user_id)));
      }
    }
    loadPushStatus();
  }, []);

  const membersWithDefaultRole = users.filter(
    (u) => !u.role || u.role === "member"
  );
  const hasRoleIssue = membersWithDefaultRole.length > 0;

  function startEdit(id: string) {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    setEditingId(id);
    setEditRole(user.role || "member");
    setEditDescription(user.description || "");
  }

  function saveEdit(id: string) {
    updateUser(id, {
      role: editRole,
      description: editDescription.trim() || undefined,
    });
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" ref={trapRef}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" role="dialog" aria-modal="true" aria-label="Team Roles">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-gray-600" />
            <h2 className="text-lg font-black text-gray-900">Team Roles</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info banner */}
        {hasRoleIssue ? (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>{membersWithDefaultRole.length} member{membersWithDefaultRole.length > 1 ? "s" : ""}</strong> ha{membersWithDefaultRole.length > 1 ? "ve" : "s"} no role set.
              AI can&apos;t auto-assign tasks without roles. Set a role for each person below.
            </p>
          </div>
        ) : (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-cyan-50 border border-cyan-200 flex items-start gap-2">
            <Sparkles size={14} className="text-cyan-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-cyan-700">
              All team members have roles set. AI smart assignment is active — tasks like &quot;fix the bug&quot; will auto-assign to developers.
            </p>
          </div>
        )}

        {/* User list */}
        <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
            >
              {editingId === user.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: user.color || "#999" }}
                    >
                      {user.initials}
                    </div>
                    <span className="text-sm font-bold text-gray-900">{user.name}</span>
                  </div>

                  {/* Role selector */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Role</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ROLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setEditRole(opt.value)}
                          className={`px-2 py-1.5 text-xs font-semibold rounded-lg border transition-all text-left ${
                            editRole === opt.value
                              ? `${ROLE_COLORS[opt.value]} ring-2 ring-offset-1 ring-cyan-300 border-transparent`
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          }`}
                          title={opt.description}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Description <span className="text-gray-400 font-normal">(helps AI match tasks)</span>
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="e.g., Full-stack developer, handles front-end and API work"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(user.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white text-xs font-bold rounded-lg hover:bg-cyan-600 transition-colors"
                    >
                      <Check size={12} />
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: user.color || "#999" }}
                  >
                    {user.initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-gray-800">{user.name}</span>
                    {user.description && (
                      <p className="text-xs text-gray-400 truncate">{user.description}</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                      ROLE_COLORS[user.role || "member"] || ROLE_COLORS.member
                    }`}
                  >
                    {ROLE_OPTIONS.find((r) => r.value === (user.role || "member"))?.label || "Member"}
                  </span>

                  {/* Push status */}
                  {pushUsers.has(user.id) ? (
                    <span title="Push notifications enabled" className="flex-shrink-0">
                      <Bell size={12} className="text-green-500" />
                    </span>
                  ) : (
                    <span title="No push — user needs to enable on their device" className="flex-shrink-0">
                      <BellOff size={12} className="text-gray-300" />
                    </span>
                  )}

                  {/* Edit button */}
                  <button
                    onClick={() => startEdit(user.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                    title="Edit role"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-100 px-6 py-3">
          <p className="text-xs text-gray-400 text-center">
            Roles help AI assign tasks automatically — e.g. &quot;fix the bug&quot; → Developer
          </p>
        </div>
      </div>
    </div>
  );
}
