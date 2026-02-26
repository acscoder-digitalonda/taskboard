"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { UserPreferences } from "@/types";
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  hasActivePushSubscription,
} from "@/lib/push";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Smartphone,
  Bell,
  Moon,
  Globe,
  BellRing,
} from "lucide-react";

const COMMON_TIMEZONES = [
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const DEFAULT_PREFS: Omit<UserPreferences, "user_id" | "updated_at"> = {
  whatsapp_number: null,
  whatsapp_enabled: false,
  email_notifications: true,
  notify_task_assigned: true,
  notify_mentions: true,
  notify_dm: true,
  notify_agent_reports: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
};

interface NotificationSettingsProps {
  onBack: () => void;
}

export default function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const { currentUser, session } = useAuth();
  const userId = currentUser?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Push notification state
  const [pushSupported] = useState(() => isPushSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushToggling, setPushToggling] = useState(false);

  // Form state
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(true);
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyDm, setNotifyDm] = useState(true);
  const [notifyAgentReports, setNotifyAgentReports] = useState(true);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_PREFS.timezone);

  // Track original values for dirty check
  const [original, setOriginal] = useState<typeof DEFAULT_PREFS | null>(null);

  useEffect(() => {
    if (!userId) return;

    async function loadPrefs() {
      setLoading(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (fetchErr && !fetchErr.message?.includes("does not exist")) {
          console.error("Failed to load preferences:", fetchErr);
        }

        const prefs = data || DEFAULT_PREFS;

        setWhatsappNumber(prefs.whatsapp_number || "");
        setWhatsappEnabled(prefs.whatsapp_enabled ?? false);
        setNotifyTaskAssigned(prefs.notify_task_assigned ?? true);
        setNotifyMentions(prefs.notify_mentions ?? true);
        setNotifyDm(prefs.notify_dm ?? true);
        setNotifyAgentReports(prefs.notify_agent_reports ?? true);
        setQuietStart(prefs.quiet_hours_start || "");
        setQuietEnd(prefs.quiet_hours_end || "");
        setTimezone(prefs.timezone || DEFAULT_PREFS.timezone);

        setOriginal({
          whatsapp_number: prefs.whatsapp_number || null,
          whatsapp_enabled: prefs.whatsapp_enabled ?? false,
          email_notifications: prefs.email_notifications ?? true,
          notify_task_assigned: prefs.notify_task_assigned ?? true,
          notify_mentions: prefs.notify_mentions ?? true,
          notify_dm: prefs.notify_dm ?? true,
          notify_agent_reports: prefs.notify_agent_reports ?? true,
          quiet_hours_start: prefs.quiet_hours_start || null,
          quiet_hours_end: prefs.quiet_hours_end || null,
          timezone: prefs.timezone || DEFAULT_PREFS.timezone,
        });
      } finally {
        setLoading(false);
      }
    }

    loadPrefs();

    // Check push subscription state
    if (pushSupported) {
      setPushPermission(getPushPermission());
      hasActivePushSubscription().then(setPushEnabled);
    }
  }, [userId, pushSupported]);

  const hasChanges = original
    ? whatsappNumber !== (original.whatsapp_number || "") ||
      whatsappEnabled !== original.whatsapp_enabled ||
      notifyTaskAssigned !== original.notify_task_assigned ||
      notifyMentions !== original.notify_mentions ||
      notifyDm !== original.notify_dm ||
      notifyAgentReports !== original.notify_agent_reports ||
      quietStart !== (original.quiet_hours_start || "") ||
      quietEnd !== (original.quiet_hours_end || "") ||
      timezone !== original.timezone
    : false;

  async function handlePushToggle() {
    if (!session?.access_token) return;
    setPushToggling(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(session.access_token);
        setPushEnabled(false);
      } else {
        const ok = await subscribeToPush(session.access_token);
        setPushEnabled(ok);
        if (!ok) {
          setPushPermission(getPushPermission());
        }
      }
    } finally {
      setPushToggling(false);
      setPushPermission(getPushPermission());
    }
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);

    try {
      const payload = {
        user_id: userId,
        whatsapp_number: whatsappNumber.trim() || null,
        whatsapp_enabled: whatsappEnabled,
        notify_task_assigned: notifyTaskAssigned,
        notify_mentions: notifyMentions,
        notify_dm: notifyDm,
        notify_agent_reports: notifyAgentReports,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        timezone,
      };

      const { error: upsertErr } = await supabase
        .from("user_preferences")
        .upsert(payload, { onConflict: "user_id" });

      if (upsertErr) throw upsertErr;

      // Update original to match saved state
      setOriginal({
        whatsapp_number: payload.whatsapp_number,
        whatsapp_enabled: payload.whatsapp_enabled,
        email_notifications: true,
        notify_task_assigned: payload.notify_task_assigned,
        notify_mentions: payload.notify_mentions,
        notify_dm: payload.notify_dm,
        notify_agent_reports: payload.notify_agent_reports,
        quiet_hours_start: payload.quiet_hours_start,
        quiet_hours_end: payload.quiet_hours_end,
        timezone: payload.timezone,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button
            onClick={onBack}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={14} className="text-gray-500" />
          </button>
          <span className="text-sm font-bold text-gray-900">Notifications</span>
        </div>
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          Loading preferences...
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={14} className="text-gray-500" />
        </button>
        <span className="text-sm font-bold text-gray-900">Notifications</span>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        <div className="px-4 py-4 space-y-5">
          {/* Push Notifications Section */}
          {pushSupported && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BellRing size={14} className="text-cyan-500" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Push Notifications
                </span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div>
                    <span className="text-sm text-gray-700 font-medium">
                      {pushToggling ? "Updating..." : "Enable push notifications"}
                    </span>
                    {pushPermission === "denied" && (
                      <p className="text-[10px] text-red-400 mt-0.5">
                        Blocked by browser — enable in site settings
                      </p>
                    )}
                    {pushEnabled && pushPermission === "granted" && (
                      <p className="text-[10px] text-green-500 mt-0.5">
                        Active on this device
                      </p>
                    )}
                  </div>
                  <div
                    className={`relative w-10 h-5.5 rounded-full transition-colors ${
                      pushEnabled ? "bg-cyan-500" : "bg-gray-300"
                    } ${pushToggling || pushPermission === "denied" ? "opacity-50" : ""}`}
                    onClick={() => {
                      if (!pushToggling && pushPermission !== "denied") {
                        handlePushToggle();
                      }
                    }}
                  >
                    <div
                      className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${
                        pushEnabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </label>
                <p className="text-[10px] text-gray-400">
                  Get notified on this device when tasks are assigned to you
                </p>
                {pushEnabled && pushPermission === "granted" && (
                  <button
                    onClick={async () => {
                      if (!session?.access_token) return;
                      try {
                        const res = await fetch("/api/notifications/test", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({
                            target_email: "acscoder@gmail.com",
                          }),
                        });
                        const data = await res.json();
                        const lines = [
                          `Target: ${data.target_email || "(self)"}`,
                          `User ID: ${data.target_user_id || "?"}`,
                          `Subscriptions found: ${data.subscriptions_found ?? "?"}`,
                          `Devices reached: ${data.devices_reached ?? 0}`,
                          data.expired_removed ? `Expired removed: ${data.expired_removed}` : "",
                          data.error ? `Error: ${data.error}` : "",
                          data.errors?.length ? `Errors:\n${data.errors.join("\n")}` : "",
                          data.hint ? `Hint: ${data.hint}` : "",
                        ].filter(Boolean);
                        alert(lines.join("\n"));
                      } catch (err) {
                        alert(`Failed to send test notification: ${err}`);
                      }
                    }}
                    className="mt-1 text-xs font-medium text-cyan-600 hover:text-cyan-700 underline underline-offset-2"
                  >
                    Send test notification
                  </button>
                )}
              </div>
            </div>
          )}

          {/* WhatsApp Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone size={14} className="text-green-600" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                WhatsApp
              </span>
            </div>

            <div className="space-y-3">
              {/* Phone number */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+351 925 803 387"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  International format with country code. WhatsApp alerts for urgent (P1) tasks only.
                </p>
              </div>

              {/* Enable toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm text-gray-700 font-medium">
                  Enable WhatsApp notifications
                </span>
                <div
                  className={`relative w-10 h-5.5 rounded-full transition-colors ${
                    whatsappEnabled ? "bg-green-500" : "bg-gray-300"
                  }`}
                  onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                >
                  <div
                    className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${
                      whatsappEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>
          </div>

          {/* Notification Toggles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={14} className="text-cyan-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Notify Me About
              </span>
            </div>

            <div className="space-y-2">
              {[
                {
                  label: "Task assigned to me",
                  value: notifyTaskAssigned,
                  setter: setNotifyTaskAssigned,
                },
                {
                  label: "Mentions (@me)",
                  value: notifyMentions,
                  setter: setNotifyMentions,
                },
                {
                  label: "Direct messages",
                  value: notifyDm,
                  setter: setNotifyDm,
                },
                {
                  label: "Agent reports",
                  value: notifyAgentReports,
                  setter: setNotifyAgentReports,
                },
              ].map(({ label, value, setter }) => (
                <label
                  key={label}
                  className="flex items-center justify-between cursor-pointer py-1"
                >
                  <span className="text-sm text-gray-700">{label}</span>
                  <div
                    className={`relative w-10 h-5.5 rounded-full transition-colors ${
                      value ? "bg-cyan-500" : "bg-gray-300"
                    }`}
                    onClick={() => setter(!value)}
                  >
                    <div
                      className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${
                        value ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Moon size={14} className="text-purple-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Quiet Hours
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 mb-1">From</label>
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors"
                />
              </div>
              <span className="text-gray-400 mt-4">-</span>
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 mb-1">To</label>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              No push or WhatsApp notifications during quiet hours
            </p>
          </div>

          {/* Timezone */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} className="text-blue-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Timezone
              </span>
            </div>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-200 focus:border-cyan-300 focus:outline-none transition-colors bg-white"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
              {/* If user's detected timezone isn't in the common list, add it */}
              {!COMMON_TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone.replace(/_/g, " ")}</option>
              )}
            </select>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              saved
                ? "bg-green-50 text-green-700 border border-green-200"
                : hasChanges
                ? "bg-cyan-500 text-white hover:bg-cyan-600 active:bg-cyan-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? (
              "Saving..."
            ) : saved ? (
              <>
                <CheckCircle2 size={14} />
                Saved!
              </>
            ) : (
              <>
                <Save size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
