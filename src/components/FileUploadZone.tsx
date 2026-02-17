"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Paperclip,
} from "lucide-react";
import { FileAttachment, FileUploadProgress } from "@/types";
import {
  uploadFile,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  HARD_LIMIT_BYTES,
  HARD_LIMIT_MB,
} from "@/lib/files";

interface FileUploadZoneProps {
  uploadedBy: string;
  projectId?: string;
  taskId?: string;
  channelId?: string;
  onUploadComplete: (file: FileAttachment) => void;
  onUploadError?: (fileName: string, error: string) => void;
  maxFiles?: number;
  compact?: boolean;
  className?: string;
}

let nextTempId = 1;

export default function FileUploadZone({
  uploadedBy,
  projectId,
  taskId,
  channelId,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  compact = false,
  className = "",
}: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<FileUploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // ── Process selected files ───────────────────────────────────

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).slice(0, maxFiles);

      // Create progress entries
      const newUploads: FileUploadProgress[] = files.map((file) => {
        const tempId = `upload-${nextTempId++}`;
        return {
          file,
          tempId,
          name: file.name,
          size: file.size,
          percent: 0,
          status: "pending" as const,
        };
      });

      // Validate sizes
      for (const u of newUploads) {
        if (u.size > HARD_LIMIT_BYTES) {
          u.status = "error";
          u.error = `File exceeds ${HARD_LIMIT_MB / 1024}GB limit. Use an external link instead.`;
        } else if (u.size > MAX_FILE_SIZE_BYTES) {
          u.status = "error";
          u.error = `File exceeds ${MAX_FILE_SIZE_MB}MB. Consider compressing or using an external link.`;
        }
      }

      setUploads((prev) => [...prev, ...newUploads]);

      // Upload valid files sequentially
      for (const entry of newUploads) {
        if (entry.status === "error") {
          onUploadError?.(entry.name, entry.error || "Size limit exceeded");
          continue;
        }

        // Mark as uploading
        setUploads((prev) =>
          prev.map((u) =>
            u.tempId === entry.tempId
              ? { ...u, status: "uploading" as const, percent: 30 }
              : u
          )
        );

        try {
          const result = await uploadFile(entry.file, {
            uploadedBy,
            projectId,
            taskId,
            channelId,
          });

          if (result) {
            setUploads((prev) =>
              prev.map((u) =>
                u.tempId === entry.tempId
                  ? {
                      ...u,
                      status: "complete" as const,
                      percent: 100,
                      attachment: result,
                    }
                  : u
              )
            );
            onUploadComplete(result);
          } else {
            throw new Error("Upload returned null");
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Upload failed";
          setUploads((prev) =>
            prev.map((u) =>
              u.tempId === entry.tempId
                ? { ...u, status: "error" as const, error: msg }
                : u
            )
          );
          onUploadError?.(entry.name, msg);
        }
      }

      // Clear completed after 3 seconds
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.status !== "complete"));
      }, 3000);
    },
    [uploadedBy, projectId, taskId, channelId, maxFiles, onUploadComplete, onUploadError]
  );

  // ── Drag & Drop handlers ─────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [processFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [processFiles]
  );

  const removeUpload = useCallback((tempId: string) => {
    setUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);

  // ── Compact mode: inline button + progress ───────────────────

  if (compact) {
    return (
      <div className={className}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
          title="Attach files"
        >
          <Paperclip size={18} />
        </button>

        {/* Upload progress list */}
        {uploads.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 space-y-1 bg-white rounded-xl border border-gray-100 p-2 shadow-lg">
            {uploads.map((u) => (
              <UploadRow key={u.tempId} upload={u} onRemove={removeUpload} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Full dropzone mode ───────────────────────────────────────

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Dropzone area */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-2 p-6 rounded-xl
          border-2 border-dashed cursor-pointer transition-all
          ${
            isDragging
              ? "border-cyan-400 bg-cyan-50"
              : "border-gray-200 hover:border-cyan-300 hover:bg-gray-50"
          }
        `}
      >
        <Upload
          size={24}
          className={isDragging ? "text-cyan-500" : "text-gray-300"}
        />
        <p className="text-sm text-gray-400 text-center">
          <span className="font-medium text-gray-500">Click to upload</span>{" "}
          or drag & drop
        </p>
        <p className="text-xs text-gray-300">
          Up to {MAX_FILE_SIZE_MB}MB per file
        </p>
      </div>

      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u) => (
            <UploadRow key={u.tempId} upload={u} onRemove={removeUpload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Upload row sub-component ─────────────────────────────────

function UploadRow({
  upload,
  onRemove,
}: {
  upload: FileUploadProgress;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
      {/* Status icon */}
      {upload.status === "uploading" && (
        <Loader2 size={14} className="text-cyan-500 animate-spin flex-shrink-0" />
      )}
      {upload.status === "complete" && (
        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
      )}
      {upload.status === "error" && (
        <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
      )}
      {upload.status === "pending" && (
        <Loader2 size={14} className="text-gray-300 flex-shrink-0" />
      )}

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-gray-600 text-xs font-medium">
          {upload.name}
        </p>
        {upload.error ? (
          <p className="text-xs text-red-500 truncate">{upload.error}</p>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">
              {formatFileSize(upload.size)}
            </span>
            {upload.status === "uploading" && (
              <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${upload.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove button */}
      {(upload.status === "error" || upload.status === "complete") && (
        <button
          onClick={() => onRemove(upload.tempId)}
          className="p-1 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500 transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
