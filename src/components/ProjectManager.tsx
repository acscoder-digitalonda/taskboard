"use client";

import { useState, useEffect } from "react";
import { useProjects } from "@/lib/hooks";
import { useTasks } from "@/lib/hooks";
import { ACCENT_COLORS } from "@/lib/utils";
import { Plus, Trash2, X, FolderOpen, Edit3, Check, Paperclip } from "lucide-react";
import ProjectFileBrowser from "./ProjectFileBrowser";

interface ProjectManagerProps {
  onClose: () => void;
  currentUserId?: string;
}

// L7: Use shared ACCENT_COLORS from utils
const COLOR_OPTIONS = ACCENT_COLORS;

export default function ProjectManager({ onClose, currentUserId }: ProjectManagerProps) {
  const { projects, addProject, updateProject, deleteProject } = useProjects();
  const { tasks } = useTasks();

  // M4: Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [browsingProjectId, setBrowsingProjectId] = useState<string | null>(null);

  function handleAdd() {
    if (!newName.trim()) return;
    addProject(newName.trim(), newColor);
    setNewName("");
    setNewColor(COLOR_OPTIONS[(projects.length + 1) % COLOR_OPTIONS.length]);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditName(name);
  }

  function saveEdit(id: string) {
    if (editName.trim()) {
      updateProject(id, { name: editName.trim() });
    }
    setEditingId(null);
  }

  function handleDelete(id: string) {
    deleteProject(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FolderOpen size={20} className="text-gray-600" />
            <h2 className="text-lg font-black text-gray-900">Projects</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Project list */}
        <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
          {projects.map((project) => {
            const taskCount = tasks.filter(
              (t) => t.project_id === project.id
            ).length;

            return (
              <div
                key={project.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
              >
                {/* Color dot */}
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color }}
                />

                {/* Name */}
                {editingId === project.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && saveEdit(project.id)
                      }
                      className="flex-1 px-2 py-1 text-sm font-semibold bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(project.id)}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-gray-400 hover:bg-gray-200 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-semibold text-gray-800">
                      {project.name}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">
                      {taskCount} task{taskCount !== 1 ? "s" : ""}
                    </span>
                  </>
                )}

                {/* Actions */}
                {editingId !== project.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setBrowsingProjectId(project.id)}
                      className="p-1.5 rounded-lg hover:bg-cyan-50 text-gray-400 hover:text-cyan-600 transition-colors"
                      title="Files"
                    >
                      <Paperclip size={14} />
                    </button>
                    <button
                      onClick={() => startEdit(project.id, project.name)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Rename"
                    >
                      <Edit3 size={14} />
                    </button>

                    {confirmDeleteId === project.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="px-2 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(project.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {projects.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No projects yet. Create one below.
            </div>
          )}
        </div>

        {/* Add new project */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-2 items-center">
            {/* Color picker */}
            <div className="flex gap-1 flex-shrink-0">
              {COLOR_OPTIONS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${
                    newColor === c
                      ? "ring-2 ring-offset-2 scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="New project name..."
              className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300"
            />

            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Project File Browser */}
      {browsingProjectId && currentUserId && (() => {
        const proj = projects.find((p) => p.id === browsingProjectId);
        if (!proj) return null;
        return (
          <ProjectFileBrowser
            projectId={proj.id}
            projectName={proj.name}
            projectColor={proj.color}
            currentUserId={currentUserId}
            onClose={() => setBrowsingProjectId(null)}
          />
        );
      })()}
    </div>
  );
}
