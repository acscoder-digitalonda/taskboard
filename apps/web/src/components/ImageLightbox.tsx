"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { FileAttachment } from "@/types";
import { getFileUrl } from "@/lib/files";

interface ImageLightboxProps {
  images: FileAttachment[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  const current = images[index];
  const hasMultiple = images.length > 1;

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Touch swipe support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(diff) > 50) {
        if (diff < 0) goNext();
        else goPrev();
      }
      touchStartX.current = null;
    },
    [goNext, goPrev]
  );

  const handleDownload = useCallback(async () => {
    const url = current.url || (await getFileUrl(current.storage_path));
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [current]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-white text-sm font-medium truncate max-w-[60vw]">
            {current.name}
          </p>
          {hasMultiple && (
            <span className="text-white/60 text-xs font-bold flex-shrink-0">
              {index + 1} / {images.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main image */}
      <div
        className="flex items-center justify-center w-full h-full p-12 sm:p-16"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url || ""}
          alt={current.name}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          draggable={false}
          onClick={onClose}
        />
      </div>

      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Thumbnail strip (for multiple images) */}
      {hasMultiple && (
        <div
          className="absolute bottom-4 inset-x-4 flex justify-center gap-2 overflow-x-auto py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setIndex(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                i === index
                  ? "border-white ring-2 ring-cyan-400 opacity-100"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url || ""}
                alt={img.name}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
