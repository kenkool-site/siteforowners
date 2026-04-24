"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";

interface ServiceBookingModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Fully-resolved URL to load in the iframe (already includes any
   * deep-link path/query). The caller is responsible for choosing the
   * shape appropriate to the booking provider.
   */
  bookingUrl: string;
  businessName: string;
  colors: ThemeColors;
  /** Optional branded text shown above the iframe (e.g. deposit policy). */
  introText?: string;
  /**
   * px to clip off the top of the iframe content. Use for Acuity pages
   * where the business has a tall custom intro/landing section above the
   * scheduler that we want to hide. 0 (default) = no clipping.
   */
  topClipPx?: number;
}

export function ServiceBookingModal({
  open,
  onClose,
  bookingUrl,
  businessName,
  colors,
  introText,
  topClipPx = 0,
}: ServiceBookingModalProps) {
  // Close on Escape. Lock page scroll while open so the page underneath
  // doesn't drift when customer scrolls inside the iframe.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // topClipPx is tuned against desktop intro heights; on mobile Acuity's
  // layout compresses and the same clip would eat into the actual scheduler.
  // Apply the clip only at >=640px; mobile users get the full iframe and
  // scroll past the intro naturally.
  const [applyClip, setApplyClip] = useState(false);
  useEffect(() => {
    if (!topClipPx) {
      setApplyClip(false);
      return;
    }
    const mq = window.matchMedia("(min-width: 640px)");
    setApplyClip(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setApplyClip(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [topClipPx]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Book an appointment at ${businessName}`}
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:max-h-[900px] sm:w-full sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ backgroundColor: colors.background }}
            >
              <p className="truncate text-sm font-semibold" style={{ color: colors.foreground }}>
                Book at {businessName}
              </p>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Optional branded intro above the iframe — themed with the site's
                primary/background colors so it reads as part of the site, not
                Acuity. */}
            {introText && (
              <div
                className="px-5 py-3 text-sm leading-relaxed"
                style={{
                  backgroundColor: `${colors.primary}15`,
                  color: colors.foreground,
                  borderBottom: `1px solid ${colors.primary}25`,
                }}
              >
                {introText}
              </div>
            )}

            {/* Iframe — optionally clipped at the top (desktop only) to hide
                a business's tall Acuity landing/intro section. The wrapper
                uses overflow-hidden and the iframe is pushed up by
                `topClipPx` with a matching extra height so the bottom edge
                still reaches the container. */}
            <div className="relative w-full flex-1 overflow-hidden">
              <iframe
                key={bookingUrl}
                src={bookingUrl}
                title="Book an appointment"
                className="block w-full border-0"
                style={
                  applyClip
                    ? { marginTop: `-${topClipPx}px`, height: `calc(100% + ${topClipPx}px)` }
                    : { height: "100%" }
                }
                allow="payment"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
