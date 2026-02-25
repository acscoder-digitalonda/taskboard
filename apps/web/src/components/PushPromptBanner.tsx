"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  hasActivePushSubscription,
} from "@/lib/push";
import { BellRing, X } from "lucide-react";

const DISMISS_KEY = "tb-push-dismissed";

/**
 * A dismissible banner prompting users to enable push notifications.
 *
 * CRITICAL FOR iOS: iOS 16.4+ requires Notification.requestPermission()
 * to be called from a user gesture (tap/click). setTimeout-based
 * auto-subscribe silently fails on iOS. This banner's "Enable" button
 * provides the required user gesture context.
 */
export default function PushPromptBanner() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    async function check() {
      // Only show on browsers that support push
      if (!isPushSupported()) return;

      // Don't show if user already denied (they'd need to change browser settings)
      if (getPushPermission() === "denied") return;

      // Don't show if user previously dismissed
      if (localStorage.getItem(DISMISS_KEY)) return;

      // Don't show if already subscribed
      const active = await hasActivePushSubscription();
      if (active) return;

      setVisible(true);
    }
    check();
  }, []);

  if (!visible) return null;

  async function handleEnable() {
    const token = session?.access_token;
    if (!token) return;

    setSubscribing(true);
    try {
      const ok = await subscribeToPush(token);
      if (ok) {
        setVisible(false);
        return;
      }
      // If permission was denied, hide and remember
      if (getPushPermission() === "denied") {
        localStorage.setItem(DISMISS_KEY, "denied");
        setVisible(false);
      }
    } finally {
      setSubscribing(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="bg-cyan-50 border-b border-cyan-100 px-3 sm:px-6 py-2.5">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3">
        <BellRing size={16} className="text-cyan-600 flex-shrink-0" />
        <p className="text-sm text-cyan-800 font-medium flex-1">
          Enable push notifications to get alerts on your phone.
        </p>
        <button
          onClick={handleEnable}
          disabled={subscribing}
          className="px-3 py-1.5 bg-cyan-500 text-white text-sm font-bold rounded-lg hover:bg-cyan-600 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {subscribing ? "Enabling..." : "Enable"}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-cyan-100 text-cyan-400 hover:text-cyan-600 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
