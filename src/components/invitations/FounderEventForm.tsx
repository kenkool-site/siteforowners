"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { zonedWallTimeToUtcIso } from "@/lib/invitations/event-time";

type CreatedInvitation = {
  eventId: string;
  slug: string;
  pin: string;
};

function initialTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function FounderEventForm() {
  const timezone = useMemo(initialTimezone, []);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setCreated(null);
    const form = new FormData(formElement);
    const localStart = String(form.get("startsAt") ?? "");
    const eventTimezone = String(form.get("timezone") ?? "");

    try {
      const startsAt = zonedWallTimeToUtcIso(localStart, eventTimezone);
      const response = await fetch("/api/invitations/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: form.get("ownerName"),
          ownerEmail: form.get("ownerEmail"),
          ownerPhone: form.get("ownerPhone"),
          title: form.get("title"),
          eventType: form.get("eventType"),
          locale: form.get("locale"),
          startsAt,
          timezone: eventTimezone,
        }),
      });
      const result = (await response.json()) as CreatedInvitation & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to create invitation");
      setCreated(result);
      formElement.reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create invitation");
    } finally {
      setSaving(false);
    }
  }

  async function copyPin() {
    if (!created) return;
    await navigator.clipboard.writeText(created.pin);
    setCopied(true);
  }

  if (created) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
        <p className="text-sm font-semibold text-amber-900">Invitation created</p>
        <h2 className="mt-1 text-2xl font-bold text-gray-950">Give this PIN to the owner now</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-700">
          It is shown only on this screen. Store it securely before leaving the page.
        </p>
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <code className="text-center text-3xl font-bold tracking-[0.3em] text-gray-950 sm:text-left">
            {created.pin}
          </code>
          <button
            type="button"
            onClick={copyPin}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {copied ? "PIN copied" : "Copy PIN"}
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/admin/invitations/${created.eventId}`}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            Open event editor
          </Link>
          <Link
            href="/admin/invitations"
            className="rounded-lg px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-amber-100"
          >
            Back to invitations
          </Link>
        </div>
      </section>
    );
  }

  const fieldClass = "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-950 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-gray-950">Owner access</h2>
        <p className="mt-1 text-sm text-gray-500">The owner uses this email with the PIN created after saving.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800">
            Owner name
            <input name="ownerName" required autoComplete="name" className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-gray-800">
            Owner email
            <input name="ownerEmail" type="email" required autoComplete="email" className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-gray-800 sm:col-span-2">
            Owner phone <span className="font-normal text-gray-500">(optional)</span>
            <input name="ownerPhone" type="tel" autoComplete="tel" className={fieldClass} />
          </label>
        </div>
      </section>

      <div className="border-t border-gray-200" />

      <section>
        <h2 className="text-lg font-semibold text-gray-950">Event basics</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800 sm:col-span-2">
            Event title
            <input name="title" required placeholder="Mia & Lee" className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-gray-800">
            Event type
            <select name="eventType" required defaultValue="wedding" className={fieldClass}>
              <option value="wedding">Wedding</option>
              <option value="birthday">Birthday</option>
              <option value="ceremony">Ceremony</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-800">
            Invitation language
            <select name="locale" required defaultValue="en" className={fieldClass}>
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-800">
            Start date and time
            <input name="startsAt" type="datetime-local" required className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-gray-800">
            Timezone
            <input name="timezone" required defaultValue={timezone} className={fieldClass} />
          </label>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Creating invitation…" : "Create invitation"}
      </button>
    </form>
  );
}
