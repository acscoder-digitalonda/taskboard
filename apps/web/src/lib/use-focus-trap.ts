"use client";

import { useEffect, useRef, RefObject } from "react";

/**
 * M5: Focus trap hook for modals and drawers.
 *
 * Traps Tab / Shift-Tab navigation within the container element.
 * On mount, moves focus to the first focusable element inside.
 * On unmount, restores focus to the element that was focused before.
 *
 * Usage:
 *   const trapRef = useFocusTrap<HTMLDivElement>();
 *   return <div ref={trapRef}>...</div>;
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap<T extends HTMLElement>(
  /** Set to false to temporarily disable the trap (e.g. when modal is hidden) */
  active = true
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;

    // Remember what was focused before
    previouslyFocused.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Move focus into the container on the next frame
    // (allows DOM to settle after render)
    const raf = requestAnimationFrame(() => {
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        // Fallback: make the container itself focusable
        container.setAttribute("tabindex", "-1");
        container.focus();
      }
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift-Tab: if on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus
      const prev = previouslyFocused.current;
      if (prev && prev instanceof HTMLElement) {
        prev.focus();
      }
    };
  }, [active]);

  return containerRef;
}
