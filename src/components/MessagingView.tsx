"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { MessagesPanelView } from "@/types";
import ChannelList from "./ChannelList";
import ChannelChat from "./ChannelChat";
import NewChannelForm from "./NewChannelForm";
import NewDMPicker from "./NewDMPicker";
import CommsHub from "./CommsHub";
import { MessageSquare, LayoutDashboard } from "lucide-react";

type SidebarTab = "messages" | "hub";

interface MessagingViewProps {
  onOpenTask?: (taskId: string) => void;
}

export default function MessagingView({ onOpenTask }: MessagingViewProps) {
  const { currentUser } = useAuth();
  const [view, setView] = useState<MessagesPanelView>({ kind: "list" });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("messages");

  if (!currentUser) return null;

  const handleOpenChannel = (channelId: string) => {
    setView({ kind: "channel", channelId });
    setSidebarTab("messages");
  };

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white rounded-lg border border-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`w-full sm:w-72 lg:w-80 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col ${
          view.kind !== "list" ? "hidden sm:flex" : "flex"
        }`}
      >
        {/* Tab switcher */}
        <div className="px-3 pt-3 pb-0">
          <div className="flex bg-gray-100/80 rounded-xl p-0.5 gap-0.5">
            <button
              onClick={() => setSidebarTab("messages")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                sidebarTab === "messages"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <MessageSquare size={14} />
              Messages
            </button>
            <button
              onClick={() => setSidebarTab("hub")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                sidebarTab === "hub"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <LayoutDashboard size={14} />
              Hub
            </button>
          </div>
        </div>

        {/* Tab content */}
        {sidebarTab === "messages" ? (
          <ChannelList
            userId={currentUser.id}
            activeChannelId={view.kind === "channel" ? view.channelId : null}
            onSelectChannel={(id) => setView({ kind: "channel", channelId: id })}
            onNewChannel={() => setView({ kind: "new_channel" })}
            onNewDM={() => setView({ kind: "new_dm" })}
          />
        ) : (
          <CommsHub
            onOpenChannel={handleOpenChannel}
            onOpenTask={(taskId) => onOpenTask?.(taskId)}
          />
        )}
      </div>

      {/* Main content — hidden on mobile when showing sidebar list */}
      <div
        className={`flex-1 min-w-0 flex flex-col ${
          view.kind === "list" ? "hidden sm:flex" : "flex"
        }`}
      >
        {view.kind === "list" && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">or start a new one</p>
            </div>
          </div>
        )}

        {view.kind === "channel" && (
          <ChannelChat
            channelId={view.channelId}
            userId={currentUser.id}
            onBack={() => setView({ kind: "list" })}
          />
        )}

        {view.kind === "new_channel" && (
          <NewChannelForm
            userId={currentUser.id}
            onCreated={(channelId) =>
              setView({ kind: "channel", channelId })
            }
            onCancel={() => setView({ kind: "list" })}
          />
        )}

        {view.kind === "new_dm" && (
          <NewDMPicker
            userId={currentUser.id}
            onSelect={(channelId) =>
              setView({ kind: "channel", channelId })
            }
            onCancel={() => setView({ kind: "list" })}
          />
        )}
      </div>
    </div>
  );
}
