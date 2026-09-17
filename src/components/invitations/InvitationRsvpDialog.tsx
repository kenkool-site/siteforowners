"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RsvpForm } from "./RsvpForm";
import { readableTextColor } from "@/lib/invitations/design-recipe";

export function InvitationRsvpDialog({ slug, state, preview, deadlineDate, showPublicRsvpCount, accent, background, foreground }: {
  slug: string;
  state: "published" | "rsvp_closed";
  preview: boolean;
  deadlineDate: string | null;
  showPublicRsvpCount: boolean;
  accent: string;
  background: string;
  foreground: string;
}) {
  const t = useTranslations("invitations.public.rsvp");
  const tPublic = useTranslations("invitations.public");
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const title = state === "rsvp_closed" ? t("closedTitle") : t("title");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-5 bottom-5 z-40 mx-auto min-h-12 max-w-sm rounded-full px-6 py-3 text-base font-semibold shadow-[0_12px_35px_rgba(0,0,0,0.28)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transform-none"
        style={{ backgroundColor: accent, color: readableTextColor(accent) }}
      >
        {title}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end overflow-y-auto overscroll-contain bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="invitation-rsvp-title" className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl px-5 pb-8 shadow-2xl sm:max-h-[92dvh] sm:max-w-xl sm:rounded-2xl sm:px-8" style={{ backgroundColor: background, color: foreground }}>
            <div className="sticky top-0 z-10 -mx-5 flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:-mx-8 sm:px-8 sm:pt-7" style={{ backgroundColor: background }}>
              <h2 id="invitation-rsvp-title" className="font-[family-name:var(--font-fraunces)] text-3xl sm:text-4xl">{title}</h2>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-current/25 outline-none focus-visible:ring-2 focus-visible:ring-current"><X aria-hidden="true" className="size-5" /></button>
            </div>
            {state === "published" && deadlineDate && <p className="mt-4 text-sm font-semibold">{tPublic("rsvpDeadline", { date: deadlineDate })}</p>}
            {preview && <p className="mt-4" role="status">{tPublic("previewNotice")}</p>}
            <RsvpForm preview={preview} slug={slug} allowCreate={state === "published"} showPublicRsvpCount={showPublicRsvpCount} accent={accent} />
          </section>
        </div>
      )}
    </>
  );
}
