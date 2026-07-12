"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import type {
  EstimateDeliveryMode,
  EstimateModalState,
} from "./estimate-modal-state";
import { HomeServicesEstimateForm } from "./HomeServicesEstimateForm";

interface Props {
  state: EstimateModalState;
  services: ServiceItem[];
  colors: ThemeColors;
  deliveryMode: EstimateDeliveryMode;
  onClose: () => void;
  onComplete: () => void;
}

export function HomeServicesEstimateModal({
  state,
  services,
  colors,
  deliveryMode,
  onClose,
  onComplete,
}: Props) {
  const t = useTranslations("homeServices");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!state.open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [state.open, onClose]);

  if (!state.open) return null;
  const title = state.completed
    ? t(
        deliveryMode === "preview_mock"
          ? "estimate.modal.sampleSuccessTitle"
          : "estimate.success.title",
      )
    : t("estimate.modal.title");
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-5 outline-none sm:max-w-xl sm:rounded-3xl sm:p-7"
        style={{ backgroundColor: colors.background }}
      >
        <div className="mb-5 flex justify-between gap-3">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("estimate.modal.close")}
            className="h-11 w-11"
          >
            ✕
          </button>
        </div>
        {state.completed ? (
          <div role="status">
            <p>
              {t(
                deliveryMode === "preview_mock"
                  ? "estimate.modal.sampleSuccessBody"
                  : "estimate.success.body",
              )}
            </p>
            <button
              type="button"
              className="mt-6 min-h-11 rounded-full px-5"
              style={{ backgroundColor: colors.secondary }}
              onClick={onClose}
            >
              {t("estimate.modal.close")}
            </button>
          </div>
        ) : (
          <HomeServicesEstimateForm
            services={services}
            service={state.service}
            colors={colors}
            deliveryMode={deliveryMode}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
}
