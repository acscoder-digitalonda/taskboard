"use client";

import { useEffect, useState } from "react";
import { storeErrorEmitter } from "@/lib/store";
import { AlertCircle, X } from "lucide-react";

interface ToastMessage {
  id: number;
  text: string;
}

let nextId = 0;

export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsub = storeErrorEmitter.subscribe((text) => {
      const id = nextId++;
      setMessages((prev) => [...prev, { id, text }]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, 5000);
    });
    return () => { unsub(); };
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 max-w-sm w-full px-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg animate-in slide-in-from-bottom-2"
        >
          <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
          <span className="text-sm font-medium flex-1">{msg.text}</span>
          <button
            onClick={() =>
              setMessages((prev) => prev.filter((m) => m.id !== msg.id))
            }
            className="p-1 rounded-lg hover:bg-red-100 transition-colors"
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
