"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { InvitationCommentForManagement } from "@/lib/invitations/comments";

export function GuestbookManager({ eventId, title, initialEnabled, initialComments, backHref }: {
  eventId: string;
  title: string;
  initialEnabled: boolean;
  initialComments: InvitationCommentForManagement[];
  backHref: string;
}) {
  const t = useTranslations("invitations.manage.guestbook");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [comments, setComments] = useState(initialComments);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function patch(payload: Record<string, unknown>, key: string) {
    setBusy(key); setMessage("");
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/comments`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setMessage(t("error")); return false; }
      return true;
    } catch { setMessage(t("error")); return false; }
    finally { setBusy(null); }
  }

  async function toggle() {
    const next = !enabled;
    if (await patch({ action: "set_enabled", enabled: next }, "toggle")) { setEnabled(next); setMessage(t(next ? "enabledSuccess" : "disabledSuccess")); }
  }

  async function moderate(comment: InvitationCommentForManagement) {
    const hidden = !comment.isHidden;
    if (await patch({ action: "set_hidden", commentId: comment.id, hidden }, comment.id)) {
      setComments((rows) => rows.map((row) => row.id === comment.id ? { ...row, isHidden: hidden } : row));
    }
  }

  async function remove(comment: InvitationCommentForManagement) {
    if (!window.confirm(t("deleteConfirm", { name: comment.guestName }))) return;
    setBusy(comment.id); setMessage("");
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/comments`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ commentId: comment.id }) });
      if (!response.ok) { setMessage(t("error")); return; }
      setComments((rows) => rows.filter((row) => row.id !== comment.id));
    } catch { setMessage(t("error")); }
    finally { setBusy(null); }
  }

  return <main className="min-h-screen bg-[#F7F4F8] px-4 py-7 text-[#2B2231] sm:px-6">
    <div className="mx-auto max-w-4xl">
      <Link href={backHref} className="text-sm font-semibold text-[#6D456F] underline underline-offset-4">{t("back")}</Link>
      <div className="mt-5 flex flex-col gap-5 border-b border-[#d8cedc] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{t("title")}</h1><p className="mt-2 text-[#675d6a]">{t("subtitle", { title })}</p></div>
        <button type="button" disabled={busy !== null} onClick={() => void toggle()} className={`min-h-11 rounded-full px-5 text-sm font-semibold ${enabled ? "border border-[#6D456F] bg-white text-[#55405a]" : "bg-[#6D456F] text-white"}`}>{busy === "toggle" ? t("saving") : enabled ? t("disable") : t("enable")}</button>
      </div>
      <p className="mt-5 rounded-md bg-white px-4 py-3 text-sm"><strong>{enabled ? t("enabled") : t("disabled")}</strong> {t(enabled ? "enabledHelp" : "disabledHelp")}</p>
      {message && <p role="status" aria-live="polite" className="mt-4 text-sm text-[#675d6a]">{message}</p>}
      <section className="mt-7 space-y-4" aria-label={t("commentsLabel")}>
        {comments.length === 0 ? <p className="border border-[#d8cedc] bg-white px-5 py-10 text-center text-[#675d6a]">{t("empty")}</p> : comments.map((comment) => <article key={comment.id} className="rounded-lg border border-[#d8cedc] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{comment.guestName}</h2><time className="text-xs text-[#675d6a]" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></div><span className="rounded-full bg-[#F1EDF4] px-3 py-1 text-xs font-semibold">{comment.isHidden ? t("hidden") : t("visible")}</span></div>
          <p className="mt-4 whitespace-pre-wrap leading-7">{comment.body}</p>
          <div className="mt-5 flex gap-4"><button type="button" disabled={busy !== null} onClick={() => void moderate(comment)} className="min-h-11 text-sm font-semibold text-[#6D456F] underline underline-offset-4">{comment.isHidden ? t("restore") : t("hide")}</button><button type="button" disabled={busy !== null} onClick={() => void remove(comment)} className="min-h-11 text-sm font-semibold text-[#8B2E2E] underline underline-offset-4">{t("delete")}</button></div>
        </article>)}
      </section>
    </div>
  </main>;
}
