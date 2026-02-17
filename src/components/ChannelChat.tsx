"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMessages, useChannelMembers } from "@/lib/messaging-hooks";
import { useUsers } from "@/lib/hooks";
import { uploadFile, formatFileSize, getFileIconName, getFileUrl } from "@/lib/files";
import { Message, User, FileAttachment } from "@/types";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Smile,
  Hash,
  Lock,
  MoreVertical,
  Reply,
  Edit3,
  Trash2,
  Bot,
  ChevronUp,
  Search,
  X,
  File as FileIcon,
  Image,
  Video,
  Music,
  FileText,
  FileCode2,
  Archive,
  Download,
  Loader2,
} from "lucide-react";

interface ChannelChatProps {
  channelId: string;
  userId: string;
  onBack: () => void;
}

export default function ChannelChat({ channelId, userId, onBack }: ChannelChatProps) {
  const {
    messages,
    loading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useMessages(channelId, userId);
  const members = useChannelMembers(channelId);
  const users = useUsers();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Get channel info from members
  const channelName = members.length > 0
    ? members.length === 2
      ? members.find((m) => m.user_id !== userId)?.user?.name || "Direct Message"
      : `${members.length} members`
    : "Loading...";

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text, replyTo?.id);
    setReplyTo(null);
    inputRef.current?.focus();
  }, [input, replyTo, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const [uploading, setUploading] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const names = Array.from(files).map((f) => f.name);
    setUploadingNames(names);

    for (const file of Array.from(files)) {
      try {
        const attachment = await uploadFile(file, {
          uploadedBy: userId,
          channelId,
        });

        if (attachment) {
          // Send message with file metadata encoded in a recognizable format
          const sizeStr = formatFileSize(attachment.size_bytes);
          const meta = JSON.stringify({
            fileId: attachment.id,
            fileName: attachment.name,
            mimeType: attachment.mime_type,
            sizeBytes: attachment.size_bytes,
            storagePath: attachment.storage_path,
          });
          await sendMessage(`📎 ${file.name} (${sizeStr})\n__file:${meta}`, undefined);
        }
      } catch (err) {
        console.error("File upload failed:", file.name, err);
      }
      // Remove from uploading list as each completes
      setUploadingNames((prev) => prev.filter((n) => n !== file.name));
    }

    setUploading(false);
    setUploadingNames([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.body);
  };

  const confirmEdit = async () => {
    if (!editingId || !editText.trim()) return;
    await editMessage(editingId, editText.trim());
    setEditingId(null);
    setEditText("");
  };

  function groupMessagesByDate(msgs: Message[]): { date: string; messages: Message[] }[] {
    const groups: Map<string, Message[]> = new Map();
    for (const msg of msgs) {
      const dateStr = new Date(msg.created_at).toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const arr = groups.get(dateStr) || [];
      arr.push(msg);
      groups.set(dateStr, arr);
    }
    return Array.from(groups.entries()).map(([date, messages]) => ({ date, messages }));
  }

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-white">
        <button
          onClick={onBack}
          className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate">
            {channelName}
          </h3>
          <p className="text-xs text-gray-400">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Search size={16} />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {/* Load more */}
        {hasMore && (
          <div className="text-center py-3">
            <button
              onClick={loadMore}
              disabled={loading}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-700 disabled:text-gray-300 flex items-center gap-1 mx-auto"
            >
              <ChevronUp size={14} />
              {loading ? "Loading..." : "Load earlier messages"}
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <div className="text-center">
              <Hash size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs mt-1">Start the conversation!</p>
            </div>
          </div>
        )}

        {/* Message groups by date */}
        {groupedMessages.map(({ date, messages: dayMsgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs font-medium text-gray-400 px-2">
                {date}
              </span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Messages */}
            {dayMsgs.map((msg, idx) => {
              const sender = msg.sender_id ? userMap.get(msg.sender_id) : null;
              const prevMsg = idx > 0 ? dayMsgs[idx - 1] : null;
              const isSameAuthor =
                prevMsg?.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() -
                  new Date(prevMsg!.created_at).getTime() <
                  300000; // 5 min

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  sender={sender || null}
                  isSameAuthor={isSameAuthor}
                  isOwn={msg.sender_id === userId}
                  isEditing={editingId === msg.id}
                  editText={editText}
                  onEditTextChange={setEditText}
                  onConfirmEdit={confirmEdit}
                  onCancelEdit={() => { setEditingId(null); setEditText(""); }}
                  onReply={() => setReplyTo(msg)}
                  onEdit={() => startEdit(msg)}
                  onDelete={() => deleteMessage(msg.id)}
                  onReact={(emoji) => toggleReaction(msg.id, emoji)}
                />
              );
            })}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-cyan-50 border-t border-cyan-100 flex items-center gap-2">
          <Reply size={14} className="text-cyan-500 flex-shrink-0" />
          <p className="text-xs text-cyan-700 truncate flex-1">
            Replying to{" "}
            <span className="font-bold">
              {userMap.get(replyTo.sender_id || "")?.name || "Unknown"}
            </span>
            : {replyTo.body}
          </p>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 rounded hover:bg-cyan-100 text-cyan-400"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && uploadingNames.length > 0 && (
        <div className="px-4 py-2 bg-cyan-50 border-t border-cyan-100 flex items-center gap-2">
          <Loader2 size={14} className="text-cyan-500 animate-spin flex-shrink-0" />
          <p className="text-xs text-cyan-700 truncate flex-1">
            Uploading {uploadingNames[0]}
            {uploadingNames.length > 1 && ` +${uploadingNames.length - 1} more`}
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-2">
          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl resize-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none"
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Message Bubble ----

function MessageBubble({
  message,
  sender,
  isSameAuthor,
  isOwn,
  isEditing,
  editText,
  onEditTextChange,
  onConfirmEdit,
  onCancelEdit,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  message: Message;
  sender: User | null;
  isSameAuthor: boolean;
  isOwn: boolean;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (message.is_system) {
    return (
      <div className="text-center py-2">
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`group flex gap-3 px-1 py-0.5 hover:bg-gray-50/50 rounded-lg transition-colors ${
        isSameAuthor ? "" : "mt-3"
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {!isSameAuthor ? (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 overflow-hidden"
          style={{ backgroundColor: sender?.color || "#9E9E9E" }}
        >
          {message.is_ai ? (
            <Bot size={16} />
          ) : sender?.avatar_url ? (
            <img src={sender.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            sender?.initials || "?"
          )}
        </div>
      ) : (
        <div className="w-8 flex-shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name + time (only on first message in group) */}
        {!isSameAuthor && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-bold text-gray-900">
              {message.is_ai ? "🤖 AI Assistant" : sender?.name || "Unknown"}
            </span>
            <span className="text-xs text-gray-400">{time}</span>
          </div>
        )}

        {/* Message body */}
        {isEditing ? (
          <div className="flex gap-2 items-end">
            <textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-cyan-200 rounded-lg resize-none focus:ring-2 focus:ring-cyan-200 focus:outline-none"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onConfirmEdit();
                }
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <button
              onClick={onConfirmEdit}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs font-medium text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="relative">
            <FileAwareMessage body={message.body} editedAt={message.edited_at || null} />
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !isEditing && (
        <div className="flex items-start gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onReply}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Reply"
          >
            <Reply size={14} />
          </button>
          <button
            onClick={() => onReact("👍")}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="React"
          >
            <Smile size={14} />
          </button>
          {isOwn && (
            <>
              <button
                onClick={onEdit}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                title="Edit"
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- File-Aware Message Body ----

const FILE_ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  File: FileIcon,
  Image,
  Video,
  Music,
  FileText,
  Sheet: FileText,
  Presentation: FileText,
  Archive,
  FileCode: FileCode2,
};

function FileAwareMessage({
  body,
  editedAt,
}: {
  body: string;
  editedAt: string | null;
}) {
  // Check if message contains an embedded file reference
  const fileMatch = body.match(/__file:(\{[\s\S]*\})$/);

  if (fileMatch) {
    try {
      const fileMeta = JSON.parse(fileMatch[1]);
      return (
        <div>
          <FileCard
            fileName={fileMeta.fileName}
            mimeType={fileMeta.mimeType}
            sizeBytes={fileMeta.sizeBytes}
            storagePath={fileMeta.storagePath}
          />
          {editedAt && (
            <span className="text-xs text-gray-400 ml-1">(edited)</span>
          )}
        </div>
      );
    } catch {
      // Fall through to regular display
    }
  }

  // Regular message (or legacy 📎 format)
  return (
    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
      {body}
      {editedAt && (
        <span className="text-xs text-gray-400 ml-1">(edited)</span>
      )}
    </p>
  );
}

// ---- Inline File Card ----

function FileCard({
  fileName,
  mimeType,
  sizeBytes,
  storagePath,
}: {
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const iconName = getFileIconName(mimeType);
  const IconComp = FILE_ICON_MAP[iconName] || FileIcon;

  const iconBgColors: Record<string, string> = {
    Image: "bg-pink-50 text-pink-500",
    Video: "bg-purple-50 text-purple-500",
    Music: "bg-orange-50 text-orange-500",
    FileText: "bg-blue-50 text-blue-500",
    Sheet: "bg-green-50 text-green-500",
    Archive: "bg-yellow-50 text-yellow-600",
    FileCode: "bg-gray-100 text-gray-500",
    File: "bg-gray-50 text-gray-400",
  };
  const bgClass = iconBgColors[iconName] || iconBgColors.File;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getFileUrl(storagePath);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      onClick={handleDownload}
      className="inline-flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 cursor-pointer transition-colors max-w-xs"
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${bgClass}`}
      >
        <IconComp size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-700 truncate">{fileName}</p>
        <p className="text-xs text-gray-400">{formatFileSize(sizeBytes)}</p>
      </div>
      <div className="flex-shrink-0">
        {downloading ? (
          <Loader2 size={14} className="text-cyan-500 animate-spin" />
        ) : (
          <Download size={14} className="text-gray-300" />
        )}
      </div>
    </div>
  );
}
