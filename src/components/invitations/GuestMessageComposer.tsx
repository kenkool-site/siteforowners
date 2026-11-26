"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BroadcastRecipientChoice } from "@/lib/invitations/broadcasts";
import {
  MESSAGE_TEMPLATE_KEYS,
  type MessageTemplateKey,
  type MessageTemplateValues,
} from "@/lib/invitations/message-templates";
import { smsOptOutLine, withSmsOptOutFooter } from "@/lib/invitations/sms-opt-out";
import type { InvitationBroadcast, InvitationLocale, InvitationNotificationChannel } from "@/lib/invitations/types";

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

type ChannelBudget = { limit: number; remaining: number };

function isChannelBudget(value: unknown): value is ChannelBudget {
  if (!value || typeof value !== "object") return false;
  const budget = value as { limit?: unknown; remaining?: unknown };
  return typeof budget.limit === "number" && typeof budget.remaining === "number";
}
type StatusFilter = "all" | "attending" | "declined";

export function GuestMessageComposer({
  eventId,
  eventName,
  backHref,
  templateValues,
  emailBudget: initialEmailBudget,
  smsBudget: initialSmsBudget,
  recipients,
  initialTotalResponses,
  initialHistory,
}: {
  eventId: string;
  eventName: string;
  backHref: string;
  templateValues: MessageTemplateValues;
  emailBudget: ChannelBudget | null;
  smsBudget: ChannelBudget | null;
  recipients: { email: BroadcastRecipientChoice[]; sms: BroadcastRecipientChoice[] };
  initialTotalResponses: number;
  initialHistory: InvitationBroadcast[];
}) {
  const t = useTranslations("invitations.manage.messageComposer");
  const uiLocale = useLocale();
  const smsLocale: InvitationLocale = uiLocale === "es" ? "es" : "en";
  const [channel, setChannel] = useState<InvitationNotificationChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateKey, setTemplateKey] = useState<MessageTemplateKey | null>(null);
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ComposerResult | null>(null);
  const [resultChannel, setResultChannel] = useState<InvitationNotificationChannel | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [emailBudget, setEmailBudget] = useState(initialEmailBudget);
  const [smsBudget, setSmsBudget] = useState(initialSmsBudget);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(
    recipients.email.filter((guest) => !guest.optedOut).map((guest) => guest.id),
  ));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const roster = channel === "email" ? recipients.email : recipients.sms;
  const selectable = roster.filter((guest) => !guest.optedOut);
  const selectedIds = selectable.filter((guest) => selected.has(guest.id)).map((guest) => guest.id);
  const recipientCount = selectedIds.length;
  const optedOutCount = channel === "sms" ? roster.filter((guest) => guest.optedOut).length : 0;
  const missingCount = initialTotalResponses - roster.length;
  const outboundSms = channel === "sms" && body.trim() ? withSmsOptOutFooter(body, smsLocale) : "";
  const smsSegments = outboundSms ? estimateSmsSegments(outboundSms) : 0;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster.filter((guest) => {
      if (statusFilter !== "all" && guest.status !== statusFilter) return false;
      if (!needle) return true;
      return guest.name.toLowerCase().includes(needle) || guest.contact.toLowerCase().includes(needle);
    });
  }, [query, roster, statusFilter]);

  const templates = useMemo(() => {
    const filled = {} as Record<MessageTemplateKey, { subject: string; email: string; sms: string }>;
    for (const key of MESSAGE_TEMPLATE_KEYS) {
      filled[key] = {
        subject: t(`templates.${key}.subject`, templateValues),
        email: t(`templates.${key}.email`, templateValues),
        sms: t(`templates.${key}.sms`, templateValues),
      };
    }
    return filled;
  }, [t, templateValues]);

  function applyTemplate(key: MessageTemplateKey | "blank", forChannel = channel) {
    if (key === "blank") {
      setTemplateKey(null);
      setEdited(false);
      setSubject("");
      setBody("");
      return;
    }
    setTemplateKey(key);
    setEdited(false);
    setSubject(templates[key].subject);
    setBody(forChannel === "sms" ? templates[key].sms : templates[key].email);
  }

  function changeChannel(next: InvitationNotificationChannel) {
    setChannel(next);
    setQuery("");
    setStatusFilter("all");
    const nextRoster = next === "email" ? recipients.email : recipients.sms;
    setSelected(new Set(nextRoster.filter((guest) => !guest.optedOut).map((guest) => guest.id)));
    if (templateKey && !edited) {
      setSubject(templates[templateKey].subject);
      setBody(next === "sms" ? templates[templateKey].sms : templates[templateKey].email);
    }
  }

  function setVisibleSelection(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const guest of visible) {
        if (guest.optedOut) continue;
        if (checked) next.add(guest.id);
        else next.delete(guest.id);
      }
      return next;
    });
  }

  function toggleGuest(id: string) {
    if (roster.some((guest) => guest.id === id && guest.optedOut)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        body: JSON.stringify({
          channel,
          subject: channel === "email" ? subject : undefined,
          body,
          recipientIds: selectedIds,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || !(data as { ok: boolean }).ok) {
        const code = data && typeof data === "object" && "code" in data ? (data as { code?: unknown }).code : undefined;
        setMessage(code === "body_too_long" ? t("bodyTooLong") : code === "invalid_recipients" ? t("invalidRecipients") : t("error"));
        return;
      }
      const payload = data as ComposerResult & {
        ok: true;
        broadcast: InvitationBroadcast;
        emailBudget?: ChannelBudget | null;
        smsBudget?: ChannelBudget | null;
      };
      setResult({ sentCount: payload.sentCount, failedCount: payload.failedCount, suppressedCount: payload.suppressedCount });
      setResultChannel(channel);
      setHistory((current) => [payload.broadcast, ...current]);
      const spent = payload.sentCount + payload.failedCount;
      if (channel === "email") {
        if (isChannelBudget(payload.emailBudget)) setEmailBudget(payload.emailBudget);
        else if (emailBudget) setEmailBudget({ limit: emailBudget.limit, remaining: Math.max(0, emailBudget.remaining - spent) });
      } else if (isChannelBudget(payload.smsBudget)) {
        setSmsBudget(payload.smsBudget);
      } else if (smsBudget) {
        setSmsBudget({ limit: smsBudget.limit, remaining: Math.max(0, smsBudget.remaining - spent) });
      }
      setTemplateKey(null);
      setEdited(false);
      setSubject("");
      setBody("");
    } catch {
      setMessage(t("error"));
    } finally {
      setSending(false);
    }
  }

  const activeBudget = channel === "email" ? emailBudget : smsBudget;
  const budgetShortfall = activeBudget !== null && recipientCount > activeBudget.remaining;
  const resultLimited = result !== null && result.suppressedCount > 0;

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
                <input type="radio" name="channel" checked={channel === "email"} onChange={() => changeChannel("email")} />
                {t("channel.email")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === "sms"} onChange={() => changeChannel("sms")} />
                {t("channel.sms")}
              </label>
            </div>
          </fieldset>

          <div className="mt-5">
            <p className="text-sm font-semibold">{t("templates.label")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyTemplate("blank")} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("templates.blank")}</button>
              {MESSAGE_TEMPLATE_KEYS.map((key) => (
                <button key={key} type="button" onClick={() => applyTemplate(key)} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t(`templates.${key}.label`)}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#807484]">{t("templates.hint")}</p>
          </div>

          {channel === "email" && (
            <label className="mt-5 block text-sm font-semibold">
              {t("fields.subject")}
              <input name="subject" value={subject} onChange={(event) => { setSubject(event.target.value); setEdited(true); }} className="mt-2 min-h-11 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
            </label>
          )}

          <label className="mt-5 block text-sm font-semibold">
            {t("fields.body")}
            <textarea value={body} onChange={(event) => { setBody(event.target.value); setEdited(true); }} rows={6} maxLength={5000} className="mt-2 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231]" />
          </label>
          {channel === "sms" && (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-[#807484]">
                {outboundSms
                  ? t("smsCharacterCountWithOptOut", { count: outboundSms.length })
                  : t("smsCharacterCount", { count: 0 })}
                {smsSegments > 1 && <span className="text-[#9a6b2f]"> · {t("smsSegmentWarning", { count: smsSegments })}</span>}
              </p>
              <p className="text-xs text-[#675d6a]">{t("smsOptOutPreview", { line: smsOptOutLine(smsLocale) })}</p>
            </div>
          )}

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">{t("recipients.label")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["all", "attending", "declined"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={statusFilter === filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${statusFilter === filter ? "border-[#6D456F] bg-[#F4EAF3] text-[#6D456F]" : "border-[#cfc3d3]"}`}
                >
                  {t(`recipients.status.${filter}`)}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm font-semibold">
              <span className="sr-only">{t("recipients.search")}</span>
              <input
                type="search"
                value={query}
                maxLength={80}
                autoComplete="off"
                placeholder={t("recipients.search")}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] font-normal text-[#2B2231]"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setVisibleSelection(true)} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("recipients.selectAll")}</button>
              <button type="button" onClick={() => setVisibleSelection(false)} className="min-h-11 rounded-full border border-[#cfc3d3] px-4 text-sm font-semibold">{t("recipients.clear")}</button>
              <p className="text-xs text-[#675d6a]">{t("recipients.selected", { count: recipientCount })}</p>
            </div>
            {roster.length === 0 ? (
              <p className="mt-3 text-sm text-[#675d6a]">{t("recipients.empty", { channel })}</p>
            ) : visible.length === 0 ? (
              <p className="mt-3 text-sm text-[#675d6a]">{t("recipients.noMatches")}</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                {visible.map((guest) => (
                  <li key={guest.id}>
                    <label className={`flex min-h-11 items-center gap-3 rounded-md px-1 py-2 text-sm ${guest.optedOut ? "text-[#8a8090]" : ""}`}>
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-[#6D456F] disabled:opacity-40"
                        checked={!guest.optedOut && selected.has(guest.id)}
                        disabled={Boolean(guest.optedOut)}
                        onChange={() => toggleGuest(guest.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{guest.name}</span>
                        <span className="block truncate text-xs text-[#675d6a]">{guest.contact}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[#807484]">
                        {guest.optedOut ? t("recipients.status.optedOut") : t(`recipients.status.${guest.status}`)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {optedOutCount > 0 && (
              <p className="mt-2 text-xs text-[#675d6a]">{t("recipients.optedOutExcluded", { count: optedOutCount })}</p>
            )}
          </fieldset>

          <p className="mt-5 text-sm text-[#675d6a]">{t("recipientPreview", { reached: recipientCount, total: initialTotalResponses })}</p>
          {missingCount > 0 && <p className="mt-1 text-xs text-[#807484]">{t("recipientPreviewGap", { missing: missingCount, channel })}</p>}
          {activeBudget && (
            <p className="mt-1 text-xs text-[#675d6a]" aria-live="polite">{t(channel === "email" ? "emailRemaining" : "smsRemaining", { remaining: activeBudget.remaining, limit: activeBudget.limit, needed: recipientCount })}</p>
          )}
          {budgetShortfall && activeBudget && (
            <p className="mt-1 text-xs text-[#9a6b2f]">{t(channel === "email" ? "emailRemainingShort" : "smsRemainingShort", { needed: recipientCount, remaining: activeBudget.remaining })}</p>
          )}

          {message && <p role="alert" className="mt-4 text-sm text-[#8a2d2d]">{message}</p>}
          {result && (
            <p role="status" aria-live="polite" className={`mt-4 text-sm ${resultLimited && result.sentCount === 0 ? "text-[#9a6b2f]" : "text-[#285d44]"}`}>
              {resultLimited
                ? t(resultChannel === "sms" ? "resultLimitSms" : "resultLimitEmail", { sent: result.sentCount, failed: result.failedCount, suppressed: result.suppressedCount })
                : t("resultSummary", { sent: result.sentCount, failed: result.failedCount, suppressed: result.suppressedCount })}
            </p>
          )}

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
