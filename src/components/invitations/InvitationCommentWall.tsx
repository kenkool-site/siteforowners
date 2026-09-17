"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { readableTextColor } from "@/lib/invitations/design-recipe";
import type { InvitationCommentPage, PublicInvitationComment } from "@/lib/invitations/comments";

export function InvitationCommentWall({ slug, initialPage, preview, accent, surface, foreground, titleClass }: {
  slug: string;
  initialPage: InvitationCommentPage;
  preview: boolean;
  accent: string;
  surface: string;
  foreground: string;
  titleClass: string;
}) {
  const t = useTranslations("invitations.public.guestbook");
  const locale = useLocale();
  const [comments, setComments] = useState(initialPage.comments);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [message, setMessage] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, width: "100%", overflow: "hidden" });
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      Object.assign(body.style, previous);
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preview) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/invitations/public/${encodeURIComponent(slug)}/comments`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestName: data.get("guestName"), body: data.get("body"), website: data.get("website") }),
      });
      const result = await response.json() as { ok?: boolean; comment?: PublicInvitationComment; code?: string };
      if (!response.ok || !result.comment) {
        setMessage(t(`errors.${result.code === "rate_limited" || result.code === "comment_wall_closed" || result.code === "invalid_request" ? result.code : "retry"}`));
        return;
      }
      setComments((current) => [result.comment!, ...current.filter((item) => item.id !== result.comment!.id)]);
      form.reset();
      setMessage(t("success"));
      setOpen(false);
    } catch { setMessage(t("errors.retry")); }
    finally { setBusy(false); }
  }

  async function showMore() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/invitations/public/${encodeURIComponent(slug)}/comments?cursor=${encodeURIComponent(cursor)}`);
      const page = await response.json() as InvitationCommentPage;
      if (!response.ok || !Array.isArray(page.comments)) { setMessage(t("errors.retry")); return; }
      setComments((current) => [...current, ...page.comments.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch { setMessage(t("errors.retry")); }
    finally { setMoreBusy(false); }
  }

  return (
    <section data-invitation-comment-wall="true" className="mx-auto mt-14 w-[calc(100%-2rem)] max-w-4xl border px-5 py-9 sm:px-9" style={{ backgroundColor: surface, borderColor: accent, color: foreground }} aria-labelledby="invitation-guestbook-title">
      <div className="text-center">
        <h2 id="invitation-guestbook-title" className={`${titleClass} text-3xl sm:text-4xl`}>{t("title")}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 opacity-75">{t("intro")}</p>
        <button type="button" disabled={preview} onClick={() => setOpen(true)} className="mt-6 min-h-11 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: accent, color: readableTextColor(accent) }}>{t("leaveNote")}</button>
      </div>
      {comments.length > 0 ? <div className="mt-9 grid gap-4 sm:grid-cols-2">{comments.map((comment) => (
        <article key={comment.id} className="border-l-2 px-4 py-2" style={{ borderColor: accent }}>
          <p className="whitespace-pre-wrap leading-7">{comment.body}</p>
          <p className="mt-3 text-sm font-semibold">{comment.guestName}</p>
          <time className="text-xs opacity-60" dateTime={comment.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(comment.createdAt))}</time>
        </article>
      ))}</div> : <p className="mt-8 text-center text-sm opacity-65">{t("empty")}</p>}
      {cursor && <div className="mt-7 text-center"><button type="button" disabled={moreBusy} onClick={() => void showMore()} className="min-h-11 px-4 text-sm font-semibold underline underline-offset-4">{moreBusy ? t("loading") : t("showMore")}</button></div>}
      {message && <p role="status" aria-live="polite" className="mt-5 text-center text-sm">{message}</p>}
      {open && <div className="fixed inset-0 z-50 flex items-end overflow-y-auto overscroll-contain bg-black/55 sm:items-center sm:justify-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="guestbook-dialog-title" className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl px-5 pb-8 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:px-8" style={{ backgroundColor: surface, color: foreground }}>
          <div className="sticky top-0 z-10 -mx-5 flex items-start justify-between px-5 pb-3 pt-5 sm:-mx-8 sm:px-8" style={{ backgroundColor: surface }}>
            <h3 id="guestbook-dialog-title" className={`${titleClass} text-3xl`}>{t("formTitle")}</h3>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-current/25"><X aria-hidden="true" className="size-5" /></button>
          </div>
          <form onSubmit={submit} className="mt-4 space-y-5">
            <label className="block text-sm font-semibold">{t("name")}<input name="guestName" required maxLength={80} className="mt-2 min-h-12 w-full rounded-md border border-current/20 bg-white px-4 text-[#172238]" /></label>
            <label className="block text-sm font-semibold">{t("comment")}<textarea name="body" required maxLength={1000} rows={5} className="mt-2 w-full rounded-md border border-current/20 bg-white px-4 py-3 text-[#172238]" /></label>
            <label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            {message && <p role="alert" aria-live="polite" className="text-sm">{message}</p>}
            <button type="submit" disabled={busy} className="min-h-12 w-full rounded-full px-6 font-semibold disabled:opacity-60" style={{ backgroundColor: accent, color: readableTextColor(accent) }}>{busy ? t("posting") : t("post")}</button>
          </form>
        </section>
      </div>}
    </section>
  );
}
