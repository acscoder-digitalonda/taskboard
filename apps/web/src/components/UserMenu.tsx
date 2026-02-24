"use client";

import { useState, useRef, useEffect } from "react";
import { User, UserRole } from "@/types";
import { useAuth } from "@/lib/auth";
import { APP_VERSION, APP_BUILD_DATE, CHANGELOG } from "@/lib/version";
import {
  LogOut,
  ChevronDown,
  Info,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  UserCog,
  Save,
  Bell,
} from "lucide-react";
import NotificationSettings from "./NotificationSettings";

type MenuView = "main" | "whats-new" | "profile" | "notifications";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "design", label: "Design" },
  { value: "strategy", label: "Strategy" },
  { value: "development", label: "Development" },
  { value: "pm", label: "Project Manager" },
  { value: "content_writer", label: "Content Writer" },
  { value: "member", label: "Member" },
];

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
  aiConnected?: boolean | null;
  onOpenOnboarding?: () => void;
}

export default function UserMenu({
  user,
  onSignOut,
  aiConnected,
  onOpenOnboarding,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (view !== "main") {
          setView("main");
        } else {
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, view]);

  // Reset to main view when closing
  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button — opens dropdown */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-xl hover:bg-gray-50 transition-colors px-1 py-1 sm:px-2"
        aria-haspopup="true"
        aria-expanded={open}
        title="Account menu"
      >
        <div
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] sm:text-xs overflow-hidden flex-shrink-0 ring-2 ring-transparent transition-all"
          style={{
            backgroundColor: user.color,
            ...(open ? { boxShadow: `0 0 0 2px ${user.color}40` } : {}),
          }}
        >
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={`${user.name} avatar`}
              className="w-full h-full object-cover"
            />
          ) : (
            user.initials
          )}
        </div>
        <ChevronDown
          size={12}
          className={`text-gray-400 transition-transform duration-200 hidden sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-gray-100 shadow-lg z-[100] overflow-hidden">
          {view === "main" ? (
            <MainView
              user={user}
              aiConnected={aiConnected}
              onSignOut={() => {
                setOpen(false);
                onSignOut();
              }}
              onWhatsNew={() => setView("whats-new")}
              onEditProfile={() => setView("profile")}
              onNotifications={() => setView("notifications")}
              onOpenOnboarding={() => {
                setOpen(false);
                onOpenOnboarding?.();
              }}
            />
          ) : view === "whats-new" ? (
            <WhatsNewView onBack={() => setView("main")} />
          ) : view === "notifications" ? (
            <NotificationSettings onBack={() => setView("main")} />
          ) : (
            <ProfileView user={user} onBack={() => setView("main")} />
          )}
        </div>
      )}
    </div>
  );
}

function MainView({
  user,
  aiConnected,
  onSignOut,
  onWhatsNew,
  onEditProfile,
  onNotifications,
  onOpenOnboarding,
}: {
  user: User;
  aiConnected?: boolean | null;
  onSignOut: () => void;
  onWhatsNew: () => void;
  onEditProfile: () => void;
  onNotifications: () => void;
  onOpenOnboarding: () => void;
}) {
  return (
    <>
      {/* User info — clickable to edit profile */}
      <button
        onClick={onEditProfile}
        className="w-full px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={`${user.name} avatar`}
                className="w-full h-full object-cover"
              />
            ) : (
              user.initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">
              {user.name}
            </p>
            <div className="flex items-center gap-1.5">
              {user.email && (
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              )}
            </div>
            {user.role && user.role !== "member" && (
              <p className="text-[10px] text-cyan-600 font-medium capitalize mt-0.5">
                {user.role === "pm" ? "Project Manager" : user.role}
              </p>
            )}
          </div>
          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
        </div>
      </button>

      {/* App info section */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        {/* Version */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Version</span>
          </div>
          <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
            v{APP_VERSION}
          </span>
        </div>

        {/* AI Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500">
              AI Parsing
            </span>
          </div>
          {aiConnected === null ? (
            <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
              Checking...
            </span>
          ) : aiConnected ? (
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 size={10} />
              Sonnet connected
            </span>
          ) : (
            <span className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle size={10} />
              Basic mode
            </span>
          )}
        </div>

        {/* Build date */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-300">
            Built {APP_BUILD_DATE}
          </span>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {/* Edit Profile */}
        <button
          onClick={onEditProfile}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UserCog size={15} className="text-cyan-500" />
            <span>Edit Profile</span>
          </div>
          <ChevronRight size={14} className="text-gray-300" />
        </button>

        {/* Notifications */}
        <button
          onClick={onNotifications}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Bell size={15} className="text-cyan-500" />
            <span>Notifications</span>
          </div>
          <ChevronRight size={14} className="text-gray-300" />
        </button>

        {/* What's New */}
        <button
          onClick={onWhatsNew}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles size={15} className="text-cyan-500" />
            <span>What&apos;s New</span>
          </div>
          <ChevronRight size={14} className="text-gray-300" />
        </button>

        {/* Help & Tour */}
        <button
          onClick={onOpenOnboarding}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <HelpCircle size={15} className="text-gray-400" />
          <span>Help &amp; Tour</span>
        </button>

        {/* Sign out */}
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut size={15} className="text-gray-400" />
          <div className="text-left">
            <span>Sign out</span>
            <p className="text-xs text-gray-400 font-normal">
              Switch to another account
            </p>
          </div>
        </button>
      </div>
    </>
  );
}

function ProfileView({ user, onBack }: { user: User; onBack: () => void }) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role || "member");
  const [description, setDescription] = useState(user.description || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    name !== user.name ||
    role !== (user.role || "member") ||
    description !== (user.description || "");

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        role,
        description: description.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={14} className="text-gray-500" />
        </button>
        <span className="text-sm font-bold text-gray-900">Edit Profile</span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Avatar display */}
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg overflow-hidden flex-shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={`${user.name} avatar`}
                className="w-full h-full object-cover"
              />
            ) : (
              user.initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors"
            placeholder="Your name"
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors bg-white"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description / Bio */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            About
            <span className="font-normal text-gray-300 ml-1">({description.length}/200)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors resize-none"
            placeholder="Short bio, e.g. 'Frontend lead, based in Amsterdam'"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            saved
              ? "bg-green-50 text-green-700 border border-green-200"
              : hasChanges
              ? "bg-cyan-500 text-white hover:bg-cyan-600 active:bg-cyan-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? (
            "Saving..."
          ) : saved ? (
            <>
              <CheckCircle2 size={14} />
              Saved!
            </>
          ) : (
            <>
              <Save size={14} />
              Save Changes
            </>
          )}
        </button>
      </div>
    </>
  );
}

function WhatsNewView({ onBack }: { onBack: () => void }) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={14} className="text-gray-500" />
        </button>
        <span className="text-sm font-bold text-gray-900">
          What&apos;s New
        </span>
      </div>

      {/* Changelog entries */}
      <div className="max-h-[400px] overflow-y-auto">
        {CHANGELOG.map((entry, i) => (
          <div
            key={entry.version}
            className={`px-4 py-3 ${i < CHANGELOG.length - 1 ? "border-b border-gray-50" : ""}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                v{entry.version}
              </span>
              <span className="text-[10px] text-gray-400">{entry.date}</span>
            </div>
            <p className="text-xs font-bold text-gray-800 mb-1">
              {entry.title}
            </p>
            <ul className="space-y-0.5">
              {entry.items.map((item, j) => (
                <li
                  key={j}
                  className="text-[11px] text-gray-500 flex items-start gap-1.5"
                >
                  <span className="text-cyan-400 mt-0.5 flex-shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
