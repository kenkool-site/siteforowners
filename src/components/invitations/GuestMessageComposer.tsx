"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { InvitationBroadcast, InvitationNotificationChannel } from "@/lib/invitations/types";

type TemplateKey = "thankYou" | "reminder" | "update";

// Rough, GSM-7-based estimate (ignores Unicode/UCS-2 detection): 160 chars
// for a single segment, 153 per segment once concatenated. Good enough for
// a cost-awareness hint, not billing-accurate.
function estimateSmsSegments(text: string): number {
  if (text.length === 0) return 0;
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

type ComposerResult = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

export function GuestMessageComposer({
  eventId,
  eventName,
  eventTitle,
  backHref,
  initialRecipientCounts,
  initialTotalResponses,
  initialHistory,
}: {
  eventId: string;
  eventName: string;
  eventTitle: string;
  backHref: string;
  initialRecipientCounts: { email: number; sms: number };
  initialTotalResponses: number;
  initialHistory: InvitationBroadcast[];
}) {
  const t = useTranslations("invitations.manage.messageComposer");
  const [channel, setChannel] = useState<InvitationNotificationChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ComposerResult | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const recipientCount = channel === "email" ? initialRecipientCounts.email : initialRecipientCounts.sms;
  const missingCount = initialTotalResponses - recipientCount;
  const smsSegments = channel === "sms" ? estimateSmsSegments(body) : 0;

  const templates = useMemo(() => ({
    thankYou: { subject: t("templates.thankYou.subject"), body: t("templates.thankYou.body", { name: eventTitle }) },
    reminder: { subject: t("templates.reminder.subject"), body: t("templates.reminder.body", { name: eventTitle }) },
    update: { subject: t("templates.update.subject"), body: t("templates.update.body", { name: eventTitle }) },
  }), [t, eventTitle]);

  function applyTemplate(key: TemplateKey | "blank") {
    if (key === "blank") { setSubject(""); setBody(""); return; }
    setSubject(templates[key].subject);
    setBody(templates[key].body);
  }

  async function send() {
    if (recipientCount === 0) return;
    const channelLabel = t(`channel.${channel}`);
    if (!window.confirm(t("confirm", { count: recipientCount, channel: channelLabel }))) return;
    setSending(true); setMessage(""); setResult(null);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, subject: channel === "email" ? subject : undefined, body }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || !(data as { ok: boolean }).ok) {
        const code = data && typeof data === "object" && "code" in data ? (data as { code?: unknown }).code : undefined;
        setMessage(code === "body_too_long" ? t("bodyTooLong") : t("error"));
        return;
      }
      const payload = data as ComposerResult & { ok: true; broadcast: InvitationBroadcast };
      setResult({ sentCount: payload.sentCount, failedCount: payload.failedCount, suppressedCount: payload.suppressedCount });
      setHistory((current) => [payload.broadcast, ...current]);
      setSubject(""); setBody("");
    } catch {
      setMessage(t("error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F4F8] px-4 py-7 text-[#2B2231] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href={backHref} className="text-sm font-semibold text-[#6D456F] underline underline-offset-4">{t("back")}</Link>
        <h1 className="mt-5 font-[family-name:var(--font-fraunces)] text-4xl">{t("title")}</h1>
        <p className="mt-2 text-[#675d6a]">{t("subtitle", { name: eventName })}</p>

        <div className="mt-7 rounded-lg border border-[#d8cedc] bg-white p-5 sm:p-6">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">{t("channel.label")}</legend>
            <div className="flex gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === "email"} onChange={() => setChannel("email")} />
                {t("channel.email")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === "sms"} onChange={() => setChannel("sms")} />
                {t("channel.sms")}
              </label>
            </div>
          </fieldset>

          <div className="mt-5">
            <p className="text-sm font-semibold">{t("templates.label")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyTemplate("blank")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.blank")}</button>
              <button type="button" onClick={() => applyTemplate("thankYou")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.thankYou.label")}</button>
              <button type="button" onClick={() => applyTemplate("reminder")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.reminder.label")}</button>
              <button type="button" onClick={() => applyTemplate("update")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.update.label")}</button>
            </div>
          </div>

          {channel === "email" && (
            <label className="mt-5 block text-sm font-semibold">
              {t("fields.subject")}
              <input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
            </label>
          )}

          <label className="mt-5 block text-sm font-semibold">
            {t("fields.body")}
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} maxLength={5000} className="mt-2 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
          </label>
          {channel === "sms" && (
            <p className="mt-1 text-xs text-[#807484]">
              {t("smsCharacterCount", { count: body.length })}
              {smsSegments > 1 && <span className="text-[#9a6b2f]"> · {t("smsSegmentWarning", { count: smsSegments })}</span>}
            </p>
          )}

          <p className="mt-5 text-sm text-[#675d6a]">{t("recipientPreview", { reached: recipientCount, total: initialTotalResponses })}</p>
          {missingCount > 0 && <p className="mt-1 text-xs text-[#807484]">{t("recipientPreviewGap", { missing: missingCount, channel })}</p>}

          {message && <p role="alert" className="mt-4 text-sm text-[#8a2d2d]">{message}</p>}
          {result && <p role="status" aria-live="polite" className="mt-4 text-sm text-[#285d44]">{t("resultSummary", { sent: result.sentCount, failed: result.failedCount, suppressed: result.suppressedCount })}</p>}

          <button
            type="button"
            disabled={sending || recipientCount === 0 || !body.trim() || (channel === "email" && !subject.trim())}
            onClick={() => void send()}
            className="mt-6 min-h-11 rounded-full bg-[#6D456F] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? t("sending") : t("send")}
          </button>
        </div>

        <section className="mt-8" aria-label={t("history.title")}>
          <h2 className="text-lg font-semibold">{t("history.title")}</h2>
          {history.length === 0 ? (
            <p className="mt-3 rounded-lg border border-[#d8cedc] bg-white px-5 py-8 text-center text-sm text-[#675d6a]">{t("history.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-lg border border-[#d8cedc] bg-white p-4">
                  <p className="text-sm font-semibold">{item.subject ?? item.body.slice(0, 60)}</p>
                  <p className="mt-1 text-xs text-[#675d6a]">{t("history.counts", { sent: item.sentCount, failed: item.failedCount, suppressed: item.suppressedCount })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
