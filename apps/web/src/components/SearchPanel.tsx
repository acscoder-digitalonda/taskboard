"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { searchEverything } from "@/lib/search";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { SearchResult } from "@/types";
import {
  Search,
  X,
  FileText,
  MessageSquare,
  Folder,
  Hash,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface SearchPanelProps {
  onSelectResult?: (result: SearchResult) => void;
  onClose: () => void;
}

export default function SearchPanel({ onSelectResult, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(30);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "task" | "message" | "file" | "channel"
  >("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // M5: Trap focus within search panel
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    inputRef.current?.focus();
    // M4: Lock body scroll while search panel is open
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      const types =
        activeFilter === "all"
          ? undefined
          : [activeFilter as "task" | "message" | "file" | "channel"];
      const res = await searchEverything(q, { types, limit });
      setResults(res);
      setLoading(false);
    },
    [activeFilter, limit]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    setLimit(30);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleFilterChange = (
    filter: "all" | "task" | "message" | "file" | "channel"
  ) => {
    setActiveFilter(filter);
    setLimit(30);
    if (query.trim()) {
      doSearch(query);
    }
  };

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  const typeIcon = {
    task: <CheckCircle2 size={14} className="text-cyan-500" />,
    message: <MessageSquare size={14} className="text-magenta-500" />,
    file: <FileText size={14} className="text-yellow-500" />,
    channel: <Hash size={14} className="text-gray-500" />,
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-[100] flex items-start justify-center pt-[10vh]" ref={trapRef}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" role="dialog" aria-modal="true" aria-label="Search">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search tasks, messages, files..."
            className="flex-1 text-base outline-none placeholder-gray-400"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 ml-2"
          >
            ESC
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-5 py-2 border-b border-gray-50">
          {(
            [
              { key: "all", label: "All" },
              { key: "task", label: "Tasks" },
              { key: "message", label: "Messages" },
              { key: "file", label: "Files" },
              { key: "channel", label: "Channels" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeFilter === key
                  ? "bg-cyan-50 text-cyan-600"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs mt-1">Try different keywords</p>
            </div>
          )}

          {!loading && !query && (
            <div className="py-12 text-center text-gray-400">
              <p className="text-sm">
                Search across all tasks, messages, files, and channels
              </p>
            </div>
          )}

          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => onSelectResult?.(result)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-start gap-3 transition-colors border-b border-gray-50 last:border-0"
            >
              <div className="mt-0.5 flex-shrink-0">
                {typeIcon[result.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {result.title}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {result.snippet}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                <Clock size={10} />
                {formatDate(result.created_at)}
              </div>
            </button>
          ))}

          {!loading && results.length >= limit && (
            <button
              onClick={() => {
                setLimit((prev) => prev + 30);
                doSearch(query);
              }}
              className="w-full py-3 text-xs font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 transition-colors"
            >
              Load more results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
