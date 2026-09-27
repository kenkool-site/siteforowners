"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EVENT_TYPES, type EventType } from "@/lib/invitespot-lead";

export function InvitespotLeadForm({ referralSlug }: { referralSlug: string | null }) {
  const t = useTranslations("invitespot.form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [roughDate, setRoughDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError(t("contactRequired"));
      return;
    }
    if (!eventType) {
      setError(t("eventTypeRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/invitespot-leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          eventType,
          roughDate,
          guestCount: guestCount ? Number(guestCount) : null,
          referralSlug: referralSlug ?? "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" && data.error ? data.error : t("genericError"));
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section id="event-form" className="bg-[#1F3A2E] px-6 py-16 text-center">
        <p className="mx-auto max-w-md text-lg font-medium text-[#F4EEE4]">{t("success")}</p>
      </section>
    );
  }

  return (
    <section id="event-form" className="bg-[#1F3A2E] px-6 py-16">
      <form onSubmit={handleSubmit} className="mx-auto max-w-md">
        <h2 className="font-serif text-3xl text-[#F4EEE4]">{t("heading")}</h2>
        <p className="mt-1.5 text-sm text-[#B9C4BC]">{t("subtitle")}</p>

        <label className="mt-6 block text-xs font-semibold text-[#D8E0DA]">
          {t("nameLabel")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm font-normal text-[#241F1A]"
          />
        </label>

        <span className="mt-4 block text-xs font-semibold text-[#D8E0DA]">{t("contactLabel")}</span>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm">
            <span className="sr-only">{t("emailPlaceholder")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className="min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="sr-only">{t("phonePlaceholder")}</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t("phonePlaceholder")}
              className="min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
            />
          </label>
        </div>

        <span className="mt-4 block text-xs font-semibold text-[#D8E0DA]">{t("planningLabel")}</span>
        <div role="radiogroup" aria-label={t("planningLabel")} className="mt-2 flex flex-wrap gap-2">
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={eventType === type}
              onClick={() => setEventType(type)}
              className={`min-h-11 rounded-full px-4 py-2 text-sm ${
                eventType === type
                  ? "border-2 border-[#F4EEE4] bg-[#F4EEE4] font-bold text-[#1F3A2E]"
                  : "border border-[#5C7268] bg-transparent text-[#F4EEE4]"
              }`}
            >
              {t(`eventTypes.${type}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <label className="flex-1 text-xs font-semibold text-[#D8E0DA]">
            {t("whenLabel")}
            <input
              value={roughDate}
              onChange={(event) => setRoughDate(event.target.value)}
              placeholder={t("whenPlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm font-normal text-[#241F1A]"
            />
          </label>
          <label className="flex-1 text-xs font-semibold text-[#D8E0DA]">
            {t("guestsLabel")}
            <input
              type="number"
              min="1"
              max="100000"
              value={guestCount}
              onChange={(event) => setGuestCount(event.target.value)}
              placeholder={t("guestsPlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm font-normal text-[#241F1A]"
            />
          </label>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-4 py-3 text-sm font-bold text-[#1F3A2E] disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
        <p className="mt-3.5 text-center text-xs text-[#8FA095]">{t("reassurance")}</p>
      </form>
    </section>
  );
}
