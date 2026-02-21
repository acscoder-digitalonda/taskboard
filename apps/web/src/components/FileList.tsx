"use client";

import React, { useState, useCallback } from "react";
import {
  File,
  Image,
  Video,
  Music,
  FileText,
  FileCode2,
  Archive,
  Download,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { FileAttachment } from "@/types";
import {
  formatFileSize,
  formatRelativeTime,
  getFileIconName,
  getFileUrl,
} from "@/lib/files";

interface FileListProps {
  files: FileAttachment[];
  onDelete?: (file: FileAttachment) => void;
  showContext?: boolean;
  compact?: boolean;
  emptyMessage?: string;
  className?: string;
}

// Map icon name string → lucide component
const ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  File,
  Image,
  Video,
  Music,
  FileText,
  Sheet: FileText,
  Presentation: FileText,
  Archive,
  FileCode: FileCode2,
};

// Icon background colors based on type
const ICON_BG: Record<string, string> = {
  Image: "bg-pink-50 text-pink-500",
  Video: "bg-purple-50 text-purple-500",
  Music: "bg-orange-50 text-orange-500",
  FileText: "bg-blue-50 text-blue-500",
  Sheet: "bg-green-50 text-green-500",
  Archive: "bg-yellow-50 text-yellow-600",
  FileCode: "bg-gray-100 text-gray-500",
  File: "bg-gray-50 text-gray-400",
  Presentation: "bg-red-50 text-red-500",
};

export default function FileList({
  files,
  onDelete,
  compact = false,
  emptyMessage = "No files yet",
  className = "",
}: FileListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = useCallback(async (file: FileAttachment) => {
    setDownloadingId(file.id);
    try {
      // Get a fresh signed URL
      const url = file.url || (await getFileUrl(file.storage_path));
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDelete = useCallback(
    (file: FileAttachment) => {
      if (confirmDeleteId === file.id) {
        onDelete?.(file);
        setConfirmDeleteId(null);
      } else {
        setConfirmDeleteId(file.id);
        // Auto-dismiss confirmation after 3 seconds
        setTimeout(() => setConfirmDeleteId(null), 3000);
      }
    },
    [confirmDeleteId, onDelete]
  );

  if (!files.length) {
    return (
      <div className={`text-center py-4 text-sm text-gray-300 ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {files.map((file) => {
        const iconName = getFileIconName(file.mime_type);
        const IconComp = ICON_MAP[iconName] || File;
        const bgClass = ICON_BG[iconName] || ICON_BG.File;
        const isImage = file.mime_type?.startsWith("image/");

        return (
          <div
            key={file.id}
            className={`
              flex items-center gap-3 group rounded-xl transition-colors
              ${compact ? "px-2 py-1.5" : "p-3 bg-gray-50 hover:bg-gray-100"}
            `}
          >
            {/* Icon / Thumbnail */}
            {isImage && file.url ? (
              <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bgClass}`}
              >
                <IconComp size={16} />
              </div>
            )}

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p
                className={`truncate font-medium text-gray-700 ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {file.name}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {formatFileSize(file.size_bytes)}
                </span>
                <span className="text-xs text-gray-300">
                  {formatRelativeTime(file.created_at)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {/* Download */}
              <button
                onClick={() => handleDownload(file)}
                disabled={downloadingId === file.id}
                className="p-1.5 rounded-lg hover:bg-white text-gray-300 hover:text-cyan-600 transition-colors"
                title="Download"
              >
                {downloadingId === file.id ? (
                  <ExternalLink size={14} className="animate-pulse" />
                ) : (
                  <Download size={14} />
                )}
              </button>

              {/* Delete */}
              {onDelete && (
                <>
                  {confirmDeleteId === file.id ? (
                    <button
                      onClick={() => handleDelete(file)}
                      className="px-2 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDelete(file)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
