"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api-client";
import { EmailDraft } from "@/types";
import {
  Mail,
  Send,
  Edit3,
  Trash2,
  X,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Bot,
  User as UserIcon,
  Clock,
  Tag,
  Brain,
  LinkIcon,
} from "lucide-react";

interface EmailDraftComposerProps {
  /** Pre-fill with an existing draft (edit mode) */
  draft?: EmailDraft;
  /** Called after successful send or discard */
  onClose: () => void;
  /** Called when draft is saved/updated */
  onDraftSaved?: (draft: EmailDraft) => void;
  /** Pre-fill fields for new drafts */
  defaults?: {
    to_email?: string;
    to_name?: string;
    subject?: string;
    body_text?: string;
    channel_id?: string;
    project_id?: string;
    gmail_thread_id?: string;
    gmail_message_id?: string;
    in_reply_to_message_id?: string;
  };
}

export default function EmailDraftComposer({
  draft: initialDraft,
  onClose,
  onDraftSaved,
  defaults,
}: EmailDraftComposerProps) {
  const { currentUser } = useAuth();

  // Form state
  const [toEmail, setToEmail] = useState(initialDraft?.to_email || defaults?.to_email || "");
  const [toName, setToName] = useState(initialDraft?.to_name || defaults?.to_name || "");
  const [subject, setSubject] = useState(initialDraft?.subject || defaults?.subject || "");
  const [bodyText, setBodyText] = useState(initialDraft?.body_text || defaults?.body_text || "");

  // UI state
  const [draftId, setDraftId] = useState(initialDraft?.id || null);
  const [status, setStatus] = useState<EmailDraft["status"]>(initialDraft?.status || "draft");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(initialDraft?.error_message || null);
  const [showToName, setShowToName] = useState(!!toName);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Track changes
  useEffect(() => {
    if (initialDraft) {
      const changed =
        toEmail !== initialDraft.to_email ||
        (toName || "") !== (initialDraft.to_name || "") ||
        subject !== initialDraft.subject ||
        bodyText !== initialDraft.body_text;
      setDirty(changed);
    } else if (toEmail || subject || bodyText) {
      setDirty(true);
    }
  }, [toEmail, toName, subject, bodyText, initialDraft]);

  // ── Save draft ──────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!toEmail || !subject || !bodyText) return;
    setSaving(true);
    setError(null);

    try {
      if (draftId) {
        // Update existing
        const res = await apiFetch(`/api/email/drafts/${draftId}`, {
          method: "PATCH",
          body: JSON.stringify({
            to_email: toEmail,
            to_name: toName || null,
            subject,
            body_text: bodyText,
            edited_by: currentUser?.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save");
        setLastSaved(new Date().toLocaleTimeString());
        setDirty(false);
        onDraftSaved?.(data.draft);
      } else {
        // Create new
        const res = await apiFetch("/api/email/drafts", {
          method: "POST",
          body: JSON.stringify({
            to_email: toEmail,
            to_name: toName || null,
            subject,
            body_text: bodyText,
            channel_id: defaults?.channel_id || null,
            project_id: defaults?.project_id || null,
            gmail_thread_id: defaults?.gmail_thread_id || null,
            gmail_message_id: defaults?.gmail_message_id || null,
            in_reply_to_message_id: defaults?.in_reply_to_message_id || null,
            generated_by: "manual",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create draft");
        setDraftId(data.draft.id);
        setStatus(data.draft.status);
        setLastSaved(new Date().toLocaleTimeString());
        setDirty(false);
        onDraftSaved?.(data.draft);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [toEmail, toName, subject, bodyText, draftId, currentUser, defaults, onDraftSaved]);

  // ── Send email ──────────────────────────────
  const handleSend = async () => {
    if (!toEmail || !subject || !bodyText) {
      setError("Fill in all required fields");
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Save first if needed
      let currentDraftId = draftId;
      if (!currentDraftId || dirty) {
        // Create or update the draft
        if (currentDraftId) {
          const patchRes = await apiFetch(`/api/email/drafts/${currentDraftId}`, {
            method: "PATCH",
            body: JSON.stringify({
              to_email: toEmail,
              to_name: toName || null,
              subject,
              body_text: bodyText,
              edited_by: currentUser?.id,
            }),
          });
          if (!patchRes.ok) {
            const patchData = await patchRes.json();
            throw new Error(patchData.error || "Failed to save draft before sending");
          }
        } else {
          const createRes = await apiFetch("/api/email/drafts", {
            method: "POST",
            body: JSON.stringify({
              to_email: toEmail,
              to_name: toName || null,
              subject,
              body_text: bodyText,
              channel_id: defaults?.channel_id || null,
              project_id: defaults?.project_id || null,
              gmail_thread_id: defaults?.gmail_thread_id || null,
              gmail_message_id: defaults?.gmail_message_id || null,
              in_reply_to_message_id: defaults?.in_reply_to_message_id || null,
              generated_by: "manual",
            }),
          });
          const createData = await createRes.json();
          if (!createRes.ok) throw new Error(createData.error || "Failed to create draft");
          currentDraftId = createData.draft.id;
          setDraftId(currentDraftId);
        }
      }

      // Now send
      const res = await apiFetch("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          draft_id: currentDraftId,
          sent_by: currentUser?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");

      setStatus("sent");
      // Brief delay then close
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      setStatus("failed");
    } finally {
      setSending(false);
    }
  };

  // ── Discard draft ───────────────────────────
  const handleDiscard = async () => {
    if (draftId) {
      try {
        await apiFetch(`/api/email/drafts/${draftId}`, { method: "DELETE" });
      } catch {
        // Ignore delete errors
      }
    }
    onClose();
  };

  // ── Retry failed ────────────────────────────
  const handleRetry = () => {
    setStatus("draft");
    setError(null);
  };

  const [showReasoning, setShowReasoning] = useState(false);

  const isSent = status === "sent";
  const isFailed = status === "failed";
  const canEdit = status === "draft" || status === "approved" || status === "failed";

  // Triage category colors
  const categoryColors: Record<string, string> = {
    design: "bg-purple-50 text-purple-700 border-purple-200",
    strategy: "bg-blue-50 text-blue-700 border-blue-200",
    development: "bg-green-50 text-green-700 border-green-200",
    pm: "bg-cyan-50 text-cyan-700 border-cyan-200",
    general: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const hasTriage = !!(initialDraft?.triage_category || initialDraft?.triage_reasoning);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-w-2xl w-full">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
        <Mail size={16} className="text-cyan-500" />
        <h3 className="text-sm font-bold text-gray-900 flex-1">
          {isSent ? "Email Sent ✓" : initialDraft ? "Edit Draft" : "Compose Email"}
        </h3>

        {/* Status badge */}
        {initialDraft && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              status === "draft"
                ? "bg-gray-100 text-gray-500"
                : status === "approved"
                ? "bg-cyan-50 text-cyan-600"
                : status === "sent"
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {status}
          </span>
        )}

        {/* Generated by badge */}
        {initialDraft?.generated_by === "ai" && (
          <span className="text-xs font-medium text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Bot size={10} />
            AI Draft
          </span>
        )}

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Triage info (for AI-triaged drafts) */}
      {hasTriage && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 space-y-2">
          {/* Category + confidence row */}
          <div className="flex items-center gap-2 flex-wrap">
            {initialDraft?.triage_category && (
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                  categoryColors[initialDraft.triage_category] || categoryColors.general
                }`}
              >
                <Tag size={10} />
                {initialDraft.triage_category}
              </span>
            )}

            {initialDraft?.triage_confidence != null && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Brain size={10} />
                {Math.round(initialDraft.triage_confidence * 100)}% confidence
              </span>
            )}

            {initialDraft?.linked_task_id && (
              <span className="text-xs font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                <LinkIcon size={10} />
                Task linked
              </span>
            )}
          </div>

          {/* AI reasoning (collapsible) */}
          {initialDraft?.triage_reasoning && (
            <div>
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
              >
                <Brain size={12} />
                AI Reasoning
                {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showReasoning && (
                <p className="mt-1.5 text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-100 leading-relaxed">
                  {initialDraft.triage_reasoning}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="p-4 space-y-3">
        {/* To */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gray-500 w-14 text-right flex-shrink-0">
            To
          </label>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            disabled={!canEdit}
            placeholder="client@example.com"
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => setShowToName(!showToName)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title={showToName ? "Hide name" : "Add recipient name"}
          >
            <UserIcon size={14} />
          </button>
        </div>

        {/* To Name (optional) */}
        {showToName && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-500 w-14 text-right flex-shrink-0">
              Name
            </label>
            <input
              type="text"
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              disabled={!canEdit}
              placeholder="Client Name (optional)"
              className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none disabled:opacity-50"
            />
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gray-500 w-14 text-right flex-shrink-0">
            Subj
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!canEdit}
            placeholder="Email subject"
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none disabled:opacity-50 font-medium"
          />
        </div>

        {/* Body */}
        <div>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            disabled={!canEdit}
            placeholder="Write your email..."
            rows={8}
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-100 rounded-xl resize-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent focus:outline-none disabled:opacity-50 leading-relaxed"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-lg border border-red-100">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-700">{error}</p>
            </div>
            {isFailed && (
              <button
                onClick={handleRetry}
                className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 flex-shrink-0"
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Success message */}
        {isSent && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 rounded-lg border border-green-100">
            <Check size={14} className="text-green-500" />
            <p className="text-xs text-green-700 font-medium">
              Email sent successfully to {toEmail}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
        {/* Save status */}
        <div className="flex-1 text-xs text-gray-400">
          {saving && (
            <span className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Saving...
            </span>
          )}
          {lastSaved && !saving && !dirty && (
            <span className="flex items-center gap-1">
              <Clock size={10} /> Saved at {lastSaved}
            </span>
          )}
          {dirty && !saving && (
            <span className="text-yellow-600">Unsaved changes</span>
          )}
        </div>

        {/* Actions */}
        {canEdit && (
          <>
            {/* Discard */}
            <button
              onClick={handleDiscard}
              disabled={sending}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} className="inline mr-1" />
              Discard
            </button>

            {/* Save */}
            <button
              onClick={saveDraft}
              disabled={sending || saving || !dirty || !toEmail || !subject || !bodyText}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Edit3 size={12} className="inline mr-1" />
              Save Draft
            </button>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={sending || !toEmail || !subject || !bodyText}
              className="px-4 py-1.5 text-xs font-bold text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={12} />
                  Send Email
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
