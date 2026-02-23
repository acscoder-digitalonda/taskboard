"use client";

import { useState, useEffect, useCallback } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { dismissOnboardingForever } from "@/lib/onboarding";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  MessageSquare,
  CheckCircle2,
  Search,
  GripVertical,
  Bell,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingModalProps {
  onClose: () => void;
  userId: string;
  /** When true (auto-triggered on login), shows "Don't show again" link */
  isAutoShown?: boolean;
}

interface OnboardingSlide {
  id: string;
  headline: string;
  body: string;
  imagePath: string;
  accentColor: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Slide data
// ---------------------------------------------------------------------------

const SLIDES: OnboardingSlide[] = [
  {
    id: "welcome",
    headline: "Welcome to TaskBoard",
    body: "Your team\u2019s command center for tasks, messages, and projects. Let\u2019s take a quick tour of what you can do.",
    imagePath: "/onboarding/slide-1.svg",
    accentColor: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)",
    icon: <Sparkles size={20} className="text-white" />,
  },
  {
    id: "views",
    headline: "Switch Between Views",
    body: "Use My Day for your personal focus list, Board for the kanban workflow, List for a sortable table, and Messages for team chat.",
    imagePath: "/onboarding/slide-2.svg",
    accentColor: "#00BCD4",
    icon: <LayoutGrid size={20} className="text-white" />,
  },
  {
    id: "create-tasks",
    headline: "Create Tasks with AI",
    body: "Type naturally in the Chat Panel \u2014 like \u201cDesign homepage for ACME, assign to Katie, due Friday\u201d \u2014 and a task is created instantly.",
    imagePath: "/onboarding/slide-3.svg",
    accentColor: "#9C27B0",
    icon: <MessageSquare size={20} className="text-white" />,
  },
  {
    id: "task-details",
    headline: "Dive Into Task Details",
    body: "Click any task card to open the detail drawer. Edit the title, status, assignee, due date, sections, and notes \u2014 all inline.",
    imagePath: "/onboarding/slide-4.svg",
    accentColor: "#E91E63",
    icon: <CheckCircle2 size={20} className="text-white" />,
  },
  {
    id: "filter-search",
    headline: "Filter & Search Everything",
    body: "Use the filter bar to narrow tasks by assignee, project, or status. Press \u2318K to search across tasks, messages, files, and channels.",
    imagePath: "/onboarding/slide-5.svg",
    accentColor: "#FF9800",
    icon: <Search size={20} className="text-white" />,
  },
  {
    id: "drag-drop",
    headline: "Drag & Drop to Organize",
    body: "In Board view, drag task cards between columns to update their status. Reorder cards within a column to set priority.",
    imagePath: "/onboarding/slide-6.svg",
    accentColor: "#4CAF50",
    icon: <GripVertical size={20} className="text-white" />,
  },
  {
    id: "messaging",
    headline: "Messages & Notifications",
    body: "Switch to the Messages tab for real-time team chat. The notification bell keeps you updated on mentions, assignments, and activity.",
    imagePath: "/onboarding/slide-7.svg",
    accentColor: "#2196F3",
    icon: <Bell size={20} className="text-white" />,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingModal({
  onClose,
  userId,
  isAutoShown = false,
}: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setCurrentSlide((s) => Math.min(s + 1, SLIDES.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlide((s) => Math.max(s - 1, 0));
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleDismissForever() {
    dismissOnboardingForever(userId);
    onClose();
  }

  function handleImageError(index: number) {
    setImgErrors((prev) => new Set(prev).add(index));
  }

  const slide = SLIDES[currentSlide];
  const isLast = currentSlide === SLIDES.length - 1;
  const isFirst = currentSlide === 0;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      ref={trapRef}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding tour"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close onboarding"
        >
          <X size={18} />
        </button>

        {/* Slide area */}
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {SLIDES.map((s, i) => (
              <div
                key={s.id}
                className="min-w-full px-6 sm:px-8 pt-6 sm:pt-8 pb-4"
                aria-hidden={i !== currentSlide}
              >
                {/* Accent icon */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                  style={{ background: s.accentColor }}
                >
                  {s.icon}
                </div>

                {/* Headline */}
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">
                  {s.headline}
                </h2>

                {/* Body */}
                <p className="text-sm sm:text-base text-gray-500 font-medium mb-5 leading-relaxed max-w-lg">
                  {s.body}
                </p>

                {/* Screenshot area */}
                <div className="rounded-xl bg-gray-50 border border-gray-100 overflow-hidden aspect-video">
                  {imgErrors.has(i) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center opacity-30"
                        style={{ background: s.accentColor }}
                      >
                        {s.icon}
                      </div>
                      <p className="text-xs text-gray-400 font-medium">
                        Screenshot coming soon
                      </p>
                    </div>
                  ) : (
                    <img
                      src={s.imagePath}
                      alt={s.headline}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(i)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${
                  i === currentSlide
                    ? "bg-cyan-500 w-4"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
                aria-label={`Go to slide ${i + 1}: ${s.headline}`}
                aria-current={i === currentSlide ? "step" : undefined}
              />
            ))}
          </div>

          {/* Slide counter */}
          <span className="text-xs text-gray-400 font-medium hidden sm:block">
            {currentSlide + 1} of {SLIDES.length}
          </span>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setCurrentSlide((s) => s - 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}

            {isLast ? (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
              >
                Get Started
              </button>
            ) : (
              <button
                onClick={() => setCurrentSlide((s) => s + 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
                aria-label="Next slide"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* "Don't show again" link — only when auto-triggered */}
        {isAutoShown && (
          <div className="text-center pb-3">
            <button
              onClick={handleDismissForever}
              className="text-xs text-gray-400 hover:text-gray-500 underline underline-offset-2 transition-colors"
            >
              Don&apos;t show this again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
