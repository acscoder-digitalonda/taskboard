"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { MessagesPanelView } from "@/types";
import ChannelList from "./ChannelList";
import ChannelChat from "./ChannelChat";
import NewChannelForm from "./NewChannelForm";
import NewDMPicker from "./NewDMPicker";

export default function MessagingView() {
  const { currentUser } = useAuth();
  const [view, setView] = useState<MessagesPanelView>({ kind: "list" });

  if (!currentUser) return null;

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white rounded-lg border border-gray-100 overflow-hidden">
      {/* Sidebar: Channel list (always visible on desktop) */}
      <div
        className={`w-full sm:w-72 lg:w-80 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 ${
          view.kind !== "list" ? "hidden sm:flex sm:flex-col" : "flex flex-col"
        }`}
      >
        <ChannelList
          userId={currentUser.id}
          activeChannelId={view.kind === "channel" ? view.channelId : null}
          onSelectChannel={(id) => setView({ kind: "channel", channelId: id })}
          onNewChannel={() => setView({ kind: "new_channel" })}
          onNewDM={() => setView({ kind: "new_dm" })}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
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
