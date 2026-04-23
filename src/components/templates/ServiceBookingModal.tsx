"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";

interface ServiceBookingModalProps {
  open: boolean;
  onClose: () => void;
  bookingUrl: string;
  appointmentTypeId: number | null;
  businessName: string;
  colors: ThemeColors;
}

function buildIframeSrc(bookingUrl: string, appointmentTypeId: number | null): string {
  if (appointmentTypeId == null) return bookingUrl;
  try {
    const u = new URL(bookingUrl);
    u.searchParams.set("appointmentType", String(appointmentTypeId));
    return u.toString();
  } catch {
    return bookingUrl;
  }
}

export function ServiceBookingModal({
  open,
  onClose,
  bookingUrl,
  appointmentTypeId,
  businessName,
  colors,
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

            {/* Iframe */}
            <iframe
              key={`${bookingUrl}-${appointmentTypeId ?? "default"}`}
              src={buildIframeSrc(bookingUrl, appointmentTypeId)}
              title="Book an appointment"
              className="h-full w-full flex-1 border-0"
              allow="payment"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
