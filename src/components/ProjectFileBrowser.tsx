"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Trash2,
  HardDrive,
  Upload,
  CheckSquare,
  Square,
} from "lucide-react";
import { FileAttachment } from "@/types";
import {
  getProjectFilesGrouped,
  deleteFile,
  deleteFiles,
  formatFileSize,
} from "@/lib/files";
import FileUploadZone from "./FileUploadZone";
import FileList from "./FileList";

interface ProjectFileBrowserProps {
  projectId: string;
  projectName: string;
  projectColor?: string;
  currentUserId: string;
  onClose: () => void;
}

export default function ProjectFileBrowser({
  projectId,
  projectName,
  projectColor = "#00BCD4",
  currentUserId,
  onClose,
}: ProjectFileBrowserProps) {
  const [taskFiles, setTaskFiles] = useState<FileAttachment[]>([]);
  const [channelFiles, setChannelFiles] = useState<FileAttachment[]>([]);
  const [generalFiles, setGeneralFiles] = useState<FileAttachment[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    tasks: true,
    channels: true,
    general: true,
  });

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Load files
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const grouped = await getProjectFilesGrouped(projectId);
      setTaskFiles(grouped.tasks);
      setChannelFiles(grouped.channels);
      setGeneralFiles(grouped.general);
      setTotalBytes(grouped.totalBytes);
      setTotalCount(grouped.total);
    } catch (err) {
      console.error("Error loading project files:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Toggle section
  const toggleSection = (section: "tasks" | "channels" | "general") => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Single file delete
  const handleDeleteFile = useCallback(
    async (file: FileAttachment) => {
      const success = await deleteFile(file.id, file.storage_path);
      if (success) {
        setTaskFiles((prev) => prev.filter((f) => f.id !== file.id));
        setChannelFiles((prev) => prev.filter((f) => f.id !== file.id));
        setGeneralFiles((prev) => prev.filter((f) => f.id !== file.id));
        setTotalCount((prev) => prev - 1);
        setTotalBytes((prev) => prev - (file.size_bytes || 0));
      }
    },
    []
  );

  // Bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const allFiles = [...taskFiles, ...channelFiles, ...generalFiles];
    const toDelete = allFiles.filter((f) => selectedIds.has(f.id));

    const count = await deleteFiles(
      toDelete.map((f) => ({ id: f.id, storage_path: f.storage_path }))
    );

    if (count > 0) {
      const ids = new Set(toDelete.map((f) => f.id));
      setTaskFiles((prev) => prev.filter((f) => !ids.has(f.id)));
      setChannelFiles((prev) => prev.filter((f) => !ids.has(f.id)));
      setGeneralFiles((prev) => prev.filter((f) => !ids.has(f.id)));
      setTotalCount((prev) => prev - count);
      const removedBytes = toDelete.reduce(
        (s, f) => s + (f.size_bytes || 0),
        0
      );
      setTotalBytes((prev) => prev - removedBytes);
      setSelectedIds(new Set());
      setBulkMode(false);
    }
  }, [selectedIds, taskFiles, channelFiles, generalFiles]);

  // Toggle file selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Upload complete handler
  const handleUploadComplete = useCallback((file: FileAttachment) => {
    setGeneralFiles((prev) => [file, ...prev]);
    setTotalCount((prev) => prev + 1);
    setTotalBytes((prev) => prev + (file.size_bytes || 0));
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Color accent */}
        <div
          className="h-1.5 w-full rounded-t-2xl"
          style={{ backgroundColor: projectColor }}
        />

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <FolderOpen size={18} style={{ color: projectColor }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {projectName} — Files
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span className="flex items-center gap-1">
                <HardDrive size={10} />
                {totalCount} file{totalCount !== 1 ? "s" : ""}
              </span>
              <span>{formatFileSize(totalBytes)} used</span>
            </div>
          </div>

          {/* Bulk mode toggle */}
          {totalCount > 0 && (
            <button
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                bulkMode
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {bulkMode ? "Cancel" : "Select"}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-8">
              <Upload size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-400">
                No files in this project yet
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Upload files below or attach them to tasks and channels
              </p>
            </div>
          ) : (
            <>
              {/* Task Files Section */}
              {taskFiles.length > 0 && (
                <CollapsibleSection
                  title="Task Files"
                  count={taskFiles.length}
                  expanded={expandedSections.tasks}
                  onToggle={() => toggleSection("tasks")}
                >
                  {bulkMode ? (
                    <BulkFileList
                      files={taskFiles}
                      selectedIds={selectedIds}
                      onToggle={toggleSelect}
                    />
                  ) : (
                    <FileList
                      files={taskFiles}
                      onDelete={handleDeleteFile}
                      compact
                    />
                  )}
                </CollapsibleSection>
              )}

              {/* Channel Files Section */}
              {channelFiles.length > 0 && (
                <CollapsibleSection
                  title="Channel Files"
                  count={channelFiles.length}
                  expanded={expandedSections.channels}
                  onToggle={() => toggleSection("channels")}
                >
                  {bulkMode ? (
                    <BulkFileList
                      files={channelFiles}
                      selectedIds={selectedIds}
                      onToggle={toggleSelect}
                    />
                  ) : (
                    <FileList
                      files={channelFiles}
                      onDelete={handleDeleteFile}
                      compact
                    />
                  )}
                </CollapsibleSection>
              )}

              {/* General Files Section */}
              <CollapsibleSection
                title="General Files"
                count={generalFiles.length}
                expanded={expandedSections.general}
                onToggle={() => toggleSection("general")}
              >
                {bulkMode ? (
                  <BulkFileList
                    files={generalFiles}
                    selectedIds={selectedIds}
                    onToggle={toggleSelect}
                  />
                ) : (
                  <FileList
                    files={generalFiles}
                    onDelete={handleDeleteFile}
                    compact
                    emptyMessage="No general files"
                  />
                )}
              </CollapsibleSection>
            </>
          )}
        </div>

        {/* Footer: Upload zone or bulk actions */}
        <div className="px-6 py-4 border-t border-gray-100">
          {bulkMode && selectedIds.size > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">
                {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}{" "}
                selected
              </span>
              <div className="flex-1" />
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete Selected
              </button>
            </div>
          ) : (
            <FileUploadZone
              uploadedBy={currentUserId}
              projectId={projectId}
              onUploadComplete={handleUploadComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Collapsible Section ----

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left py-1.5 group"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-400" />
        ) : (
          <ChevronRight size={14} className="text-gray-400" />
        )}
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-xs text-gray-300 font-semibold">({count})</span>
      </button>
      {expanded && <div className="mt-1">{children}</div>}
    </div>
  );
}

// ---- Bulk Selection File List ----

function BulkFileList({
  files,
  selectedIds,
  onToggle,
}: {
  files: FileAttachment[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {files.map((file) => {
        const selected = selectedIds.has(file.id);
        return (
          <div
            key={file.id}
            onClick={() => onToggle(file.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
              selected
                ? "bg-red-50 border border-red-100"
                : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            {selected ? (
              <CheckSquare size={16} className="text-red-500 flex-shrink-0" />
            ) : (
              <Square size={16} className="text-gray-300 flex-shrink-0" />
            )}
            <span className="text-sm text-gray-700 truncate flex-1">
              {file.name}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatFileSize(file.size_bytes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
