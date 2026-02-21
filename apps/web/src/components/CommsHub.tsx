"use client";

import { useState, useEffect, useMemo } from "react";
import { useProjects, useTasks, useUsers } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { getProjectFiles, formatFileSize, formatRelativeTime, getFileUrl, getFileIconName } from "@/lib/files";
import { FileAttachment, Task, Project, Channel, Message, AgentActivity } from "@/types";
import { EmailDraft } from "@/types";
import EmailDraftComposer from "./EmailDraftComposer";
import {
  FolderOpen,
  MessageSquare,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Download,
  ExternalLink,
  Users as UsersIcon,
  Hash,
  ArrowRight,
  Loader2,
  Inbox,
  Phone,
  File as FileIcon,
  Image,
  Video,
  Music,
  FileCode2,
  Archive,
  Paperclip,
  TrendingUp,
  X,
  Send,
  Edit3,
  PenSquare,
  Bot,
} from "lucide-react";

interface CommsHubProps {
  onOpenChannel: (channelId: string) => void;
  onOpenTask: (taskId: string) => void;
}

interface ProjectSummary {
  project: Project;
  taskCount: number;
  doingCount: number;
  doneCount: number;
  waitingCount: number;
  backlogCount: number;
  fileCount: number;
  totalBytes: number;
  recentFiles: FileAttachment[];
  channels: Channel[];
  recentEmails: EmailThread[];
  whatsappThreads: WhatsappThread[];
}

interface EmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  channel_id?: string;
}

interface WhatsappThread {
  id: string;
  contact: string;
  lastMessage: string;
  date: string;
  channel_id?: string;
}

export default function CommsHub({ onOpenChannel, onOpenTask }: CommsHubProps) {
  const { currentUser } = useAuth();
  const { projects } = useProjects();
  const { tasks } = useTasks();
  const users = useUsers();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Map<string, FileAttachment[]>>(new Map());
  const [projectChannels, setProjectChannels] = useState<Map<string, Channel[]>>(new Map());
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [composingDraft, setComposingDraft] = useState<EmailDraft | null>(null);
  const [showNewCompose, setShowNewCompose] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load project data
  useEffect(() => {
    if (!projects.length) return;

    setLoading(true);

    Promise.all([
      // Load channels linked to projects
      supabase
        .from("channels")
        .select("*")
        .eq("is_archived", false)
        .not("project_id", "is", null),
      // Load recent agent activity (email ingestion)
      supabase
        .from("agent_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      // Load pending email drafts
      apiFetch("/api/email/drafts?status=draft")
        .then((r) => r.json())
        .catch(() => ({ drafts: [] })),
      // Load files for each project (just counts + recent)
      ...projects.map((p) => getProjectFiles(p.id)),
    ]).then(([channelsRes, activityRes, draftsRes, ...fileResults]) => {
      // Map channels to projects
      const chMap = new Map<string, Channel[]>();
      for (const ch of channelsRes.data || []) {
        const arr = chMap.get(ch.project_id) || [];
        arr.push(ch);
        chMap.set(ch.project_id, arr);
      }
      setProjectChannels(chMap);

      // Map files to projects
      const fMap = new Map<string, FileAttachment[]>();
      projects.forEach((p, i) => {
        fMap.set(p.id, fileResults[i] || []);
      });
      setProjectFiles(fMap);

      // Parse email threads from agent activity
      const activity = (activityRes.data || []) as AgentActivity[];
      setAgentActivity(activity);

      const emails: EmailThread[] = activity
        .filter((a) => a.action === "email_ingested" || a.action === "ingest_email")
        .map((a) => ({
          id: a.id,
          subject: (a.metadata?.email_subject as string) || a.description,
          from: (a.metadata?.source_email as string) || a.source_email || "Unknown",
          snippet: a.description,
          date: a.created_at,
          channel_id: a.channel_id || undefined,
        }));
      setEmailThreads(emails);

      // Set drafts
      setDrafts((draftsRes as { drafts: EmailDraft[] }).drafts || []);

      setLoading(false);
    }).catch((err) => {
      console.error("Error loading comms hub:", err);
      setLoading(false);
    });
  }, [projects]);

  // Build project summaries
  const summaries: ProjectSummary[] = useMemo(() => {
    return projects.map((project) => {
      const projectTasks = tasks.filter((t) => t.project_id === project.id);
      const files = projectFiles.get(project.id) || [];
      const channels = projectChannels.get(project.id) || [];
      const projectEmails = emailThreads.filter((e) => {
        // Match emails to project via channel or agent activity
        const activity = agentActivity.find((a) => a.id === e.id);
        return activity?.project_id === project.id;
      });

      return {
        project,
        taskCount: projectTasks.length,
        doingCount: projectTasks.filter((t) => t.status === "doing").length,
        doneCount: projectTasks.filter((t) => t.status === "done").length,
        waitingCount: projectTasks.filter((t) => t.status === "waiting").length,
        backlogCount: projectTasks.filter((t) => t.status === "backlog").length,
        fileCount: files.length,
        totalBytes: files.reduce((s, f) => s + (f.size_bytes || 0), 0),
        recentFiles: files.slice(0, 5),
        channels,
        recentEmails: projectEmails.slice(0, 5),
        whatsappThreads: [],
      };
    });
  }, [projects, tasks, projectFiles, projectChannels, emailThreads, agentActivity]);

  const selectedSummary = selectedProjectId
    ? summaries.find((s) => s.project.id === selectedProjectId)
    : null;

  const reloadDrafts = async () => {
    try {
      const res = await apiFetch("/api/email/drafts?status=draft");
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Project selector */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          Project Hub
        </h3>
        <div className="flex flex-wrap gap-2">
          {summaries.map((s) => (
            <button
              key={s.project.id}
              onClick={() =>
                setSelectedProjectId(
                  selectedProjectId === s.project.id ? null : s.project.id
                )
              }
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedProjectId === s.project.id
                  ? "bg-white shadow-sm ring-2 text-gray-900"
                  : "bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm"
              }`}
              style={{
                borderColor:
                  selectedProjectId === s.project.id
                    ? s.project.color
                    : "transparent",
                ...(selectedProjectId === s.project.id
                  ? { ringColor: s.project.color }
                  : {}),
              }}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.project.color }}
              />
              <span className="truncate max-w-[160px]">{s.project.name}</span>
              {s.doingCount > 0 && (
                <span className="text-xs bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-bold">
                  {s.doingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedSummary ? (
          <AllProjectsOverview
            summaries={summaries}
            emailThreads={emailThreads}
            drafts={drafts}
            onSelectProject={setSelectedProjectId}
            onOpenChannel={onOpenChannel}
            onComposeDraft={(d) => setComposingDraft(d)}
          />
        ) : (
          <ProjectDetail
            summary={selectedSummary}
            tasks={tasks.filter((t) => t.project_id === selectedSummary.project.id)}
            users={users}
            drafts={drafts.filter((d) => d.project_id === selectedSummary.project.id)}
            onOpenChannel={onOpenChannel}
            onOpenTask={onOpenTask}
            onComposeDraft={(d) => setComposingDraft(d)}
            onNewCompose={() => setShowNewCompose(true)}
            onClose={() => setSelectedProjectId(null)}
          />
        )}
      </div>

      {/* Compose overlay */}
      {(composingDraft || showNewCompose) && (
        <div className="fixed inset-0 bg-black/30 z-[100] flex items-center justify-center p-4">
          <EmailDraftComposer
            draft={composingDraft || undefined}
            defaults={
              showNewCompose && selectedSummary
                ? { project_id: selectedSummary.project.id }
                : undefined
            }
            onClose={() => {
              setComposingDraft(null);
              setShowNewCompose(false);
              reloadDrafts();
            }}
            onDraftSaved={() => reloadDrafts()}
          />
        </div>
      )}
    </div>
  );
}

// ---- All Projects Overview ----

function AllProjectsOverview({
  summaries,
  emailThreads,
  drafts,
  onSelectProject,
  onOpenChannel,
  onComposeDraft,
}: {
  summaries: ProjectSummary[];
  emailThreads: EmailThread[];
  drafts: EmailDraft[];
  onSelectProject: (id: string) => void;
  onOpenChannel: (id: string) => void;
  onComposeDraft: (d: EmailDraft) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      {/* Pending drafts */}
      {drafts.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Edit3 size={12} />
            Draft Replies ({drafts.length})
          </h4>
          <div className="space-y-1">
            {drafts.slice(0, 5).map((draft) => (
              <button
                key={draft.id}
                onClick={() => onComposeDraft(draft)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-cyan-50/50 bg-yellow-50/30 border border-yellow-100/50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                  {draft.generated_by === "ai" ? (
                    <Bot size={13} className="text-purple-500" />
                  ) : (
                    <Edit3 size={13} className="text-yellow-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {draft.subject}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    To: {draft.to_name || draft.to_email}
                  </p>
                </div>
                <span className="text-xs text-yellow-600 font-semibold flex-shrink-0">
                  Review
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-3">
        {summaries.map((s) => (
          <button
            key={s.project.id}
            onClick={() => onSelectProject(s.project.id)}
            className="text-left p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: s.project.color + "20" }}
              >
                <FolderOpen size={16} style={{ color: s.project.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-900 truncate">
                  {s.project.name}
                </h4>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-gray-500 transition-colors"
              />
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs">
              <StatusPill
                count={s.doingCount}
                label="Active"
                color="#00BCD4"
              />
              <StatusPill
                count={s.waitingCount}
                label="Waiting"
                color="#FFD600"
              />
              <StatusPill
                count={s.doneCount}
                label="Done"
                color="#4CAF50"
              />
              {s.fileCount > 0 && (
                <span className="text-gray-400 flex items-center gap-1">
                  <Paperclip size={10} />
                  {s.fileCount}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {s.taskCount > 0 && (
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                {s.doneCount > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(s.doneCount / s.taskCount) * 100}%`,
                      backgroundColor: "#4CAF50",
                    }}
                  />
                )}
                {s.doingCount > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(s.doingCount / s.taskCount) * 100}%`,
                      backgroundColor: "#00BCD4",
                    }}
                  />
                )}
                {s.waitingCount > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(s.waitingCount / s.taskCount) * 100}%`,
                      backgroundColor: "#FFD600",
                    }}
                  />
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Recent email threads */}
      {emailThreads.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail size={12} />
            Recent Email Threads
          </h4>
          <div className="space-y-1">
            {emailThreads.slice(0, 8).map((email) => (
              <button
                key={email.id}
                onClick={() => email.channel_id && onOpenChannel(email.channel_id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {email.subject}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {email.from}
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatRelativeTime(email.date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {summaries.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-400">No projects yet</p>
          <p className="text-xs text-gray-300 mt-1">
            Create a project to see its comms hub
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Project Detail ----

function ProjectDetail({
  summary,
  tasks,
  users,
  drafts,
  onOpenChannel,
  onOpenTask,
  onComposeDraft,
  onNewCompose,
  onClose,
}: {
  summary: ProjectSummary;
  tasks: Task[];
  users: { id: string; name: string; color: string; initials: string }[];
  drafts: EmailDraft[];
  onOpenChannel: (id: string) => void;
  onOpenTask: (id: string) => void;
  onComposeDraft: (d: EmailDraft) => void;
  onNewCompose: () => void;
  onClose: () => void;
}) {
  const { project } = summary;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: project.color + "20" }}
        >
          <FolderOpen size={20} style={{ color: project.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900">{project.name}</h3>
          <p className="text-xs text-gray-400">
            {summary.taskCount} tasks &middot; {summary.fileCount} files &middot;{" "}
            {formatFileSize(summary.totalBytes)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress summary */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Progress
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-xl font-bold text-gray-400">{summary.backlogCount}</div>
            <div className="text-xs text-gray-400">Backlog</div>
          </div>
          <div>
            <div className="text-xl font-bold text-cyan-600">{summary.doingCount}</div>
            <div className="text-xs text-cyan-600">Active</div>
          </div>
          <div>
            <div className="text-xl font-bold text-yellow-600">{summary.waitingCount}</div>
            <div className="text-xs text-yellow-600">Waiting</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-600">{summary.doneCount}</div>
            <div className="text-xs text-green-600">Done</div>
          </div>
        </div>
        {summary.taskCount > 0 && (
          <div className="mt-3 h-2 bg-white rounded-full overflow-hidden flex">
            {summary.doneCount > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(summary.doneCount / summary.taskCount) * 100}%`,
                  backgroundColor: "#4CAF50",
                }}
              />
            )}
            {summary.doingCount > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(summary.doingCount / summary.taskCount) * 100}%`,
                  backgroundColor: "#00BCD4",
                }}
              />
            )}
            {summary.waitingCount > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(summary.waitingCount / summary.taskCount) * 100}%`,
                  backgroundColor: "#FFD600",
                }}
              />
            )}
            {summary.backlogCount > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(summary.backlogCount / summary.taskCount) * 100}%`,
                  backgroundColor: "#9E9E9E",
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Active tasks */}
      {tasks.filter((t) => t.status === "doing" || t.status === "waiting").length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock size={12} />
            Active Work
          </h4>
          <div className="space-y-1">
            {tasks
              .filter((t) => t.status === "doing" || t.status === "waiting")
              .slice(0, 8)
              .map((task) => {
                const assignee = users.find((u) => u.id === task.assignee_id);
                return (
                  <button
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group"
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.status === "doing" ? "bg-cyan-500" : "bg-yellow-500"
                      }`}
                    />
                    <span className="text-sm text-gray-700 truncate flex-1">
                      {task.title}
                    </span>
                    {assignee && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                        style={{ backgroundColor: assignee.color }}
                      >
                        {assignee.initials}
                      </div>
                    )}
                    <ChevronRight
                      size={14}
                      className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Project channels */}
      {summary.channels.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Hash size={12} />
            Channels
          </h4>
          <div className="space-y-1">
            {summary.channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onOpenChannel(ch.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Hash size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">
                  {ch.name || "Unnamed channel"}
                </span>
                <ArrowRight size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent files */}
      {summary.recentFiles.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Paperclip size={12} />
            Recent Files
          </h4>
          <div className="space-y-1">
            {summary.recentFiles.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Draft replies */}
      {drafts.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Edit3 size={12} />
            Draft Replies ({drafts.length})
          </h4>
          <div className="space-y-1">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => onComposeDraft(draft)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-cyan-50/50 bg-yellow-50/30 border border-yellow-100/50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                  {draft.generated_by === "ai" ? (
                    <Bot size={13} className="text-purple-500" />
                  ) : (
                    <Edit3 size={13} className="text-yellow-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {draft.subject}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    To: {draft.to_name || draft.to_email}
                  </p>
                </div>
                <span className="text-xs text-yellow-600 font-semibold flex-shrink-0">
                  Review →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compose new email */}
      <div>
        <button
          onClick={onNewCompose}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-cyan-600 hover:bg-cyan-50 transition-colors"
        >
          <PenSquare size={14} />
          Compose Email
        </button>
      </div>

      {/* Email threads */}
      {summary.recentEmails.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail size={12} />
            Email Threads
          </h4>
          <div className="space-y-1">
            {summary.recentEmails.map((email) => (
              <button
                key={email.id}
                onClick={() => email.channel_id && onOpenChannel(email.channel_id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{email.subject}</p>
                  <p className="text-xs text-gray-400">{email.from}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatRelativeTime(email.date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function StatusPill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className="flex items-center gap-1 font-semibold"
      style={{ color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {count} {label}
    </span>
  );
}

const FILE_ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  File: FileIcon,
  Image,
  Video,
  Music,
  FileText,
  Sheet: FileText,
  Archive,
  FileCode: FileCode2,
};

function FileRow({ file }: { file: FileAttachment }) {
  const [downloading, setDownloading] = useState(false);
  const iconName = getFileIconName(file.mime_type);
  const IconComp = FILE_ICON_MAP[iconName] || FileIcon;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getFileUrl(file.storage_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
    >
      <IconComp size={14} className="text-gray-400 flex-shrink-0" />
      <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">
        {formatFileSize(file.size_bytes)}
      </span>
      {downloading ? (
        <Loader2 size={12} className="text-cyan-500 animate-spin flex-shrink-0" />
      ) : (
        <Download size={12} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}
