"use client";

import { useState, useRef, useEffect } from "react";
import { User } from "@/types";
import { LogOut, ChevronDown } from "lucide-react";

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
}

export default function UserMenu({ user, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
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
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
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
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-[100] animate-in fade-in slide-in-from-top-1 duration-150">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-100">
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
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {user.name}
                </p>
                {user.email && (
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Sign out = switch account */}
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <LogOut size={15} className="text-gray-400" />
              <div className="text-left">
                <span>Sign out</span>
                <p className="text-xs text-gray-400 font-normal">Switch to another account</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
