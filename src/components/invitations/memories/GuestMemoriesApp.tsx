// src/components/invitations/memories/GuestMemoriesApp.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GuestUploadView } from "./GuestUploadView";

type Tab = "upload" | "gallery" | "moments";

// Mirrors RsvpForm.tsx's credentialFromUrl exactly: the RSVP edit link puts
// rsvpId/editToken in the URL hash, not a query string or cookie, deliberately
// kept out of logs/Referer. This is the only place that credential can arrive
// at Memories — a guest coming from their emailed RSVP link opens the *invitation*
// page first, so in practice this hash is only present if the guest manually
// navigates to /invite/[slug]/memories#rsvpId=...&editToken=... — the common
// path is landing on /invite/[slug] first. Both are handled the same way here.
function rsvpCredentialFromUrl(): { rsvpId: string; editToken: string } | null {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const rsvpId = params.get("rsvpId");
    const editToken = params.get("editToken");
    return rsvpId && editToken ? { rsvpId, editToken } : null;
  } catch {
    return null;
  }
}

export function GuestMemoriesApp({
  eventId,
  accent,
  background,
  text,
}: {
  eventId: string;
  accent: string;
  background: string;
  text: string;
}) {
  const t = useTranslations("invitations.public.memories.landing");
  const tUpload = useTranslations("invitations.public.memories.upload");
  const [tab, setTab] = useState<Tab>("upload");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);

  async function mintSession(name?: string) {
    const credential = rsvpCredentialFromUrl();
    try {
      const res = await fetch(`/api/memories/events/${eventId}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rsvpId: credential?.rsvpId,
          editToken: credential?.editToken,
          guestName: name?.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`session mint responded with status ${res.status}`);
      const data = (await res.json()) as { level: "anonymous" | "rsvp_guest"; guestName: string | null };
      if (data.guestName) setGreeting(data.guestName);
      setSessionError(false);
    } catch (error) {
      // Uploads still work anonymously without this cookie (upload/init falls back to
      // session?.level ?? "anonymous"), so a mint failure only loses RSVP-credential
      // upgrade / name attribution — surfaced inline rather than blocking the page.
      console.error("[memories] session mint failed", { error });
      setSessionError(true);
    }
  }

  useEffect(() => {
    // Mints the session immediately on landing — this is what carries the
    // RSVP-upgrade credential (available right away from the URL hash, if
    // present) and sets the cookie every later upload/init call relies on.
    // No guest name exists yet at this point; typing one re-mints below.
    void mintSession().finally(() => setSessionReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!sessionReady) return null;

  return (
    <div style={{ backgroundColor: background, color: text }} className="min-h-screen pb-20">
      <header className="p-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {sessionError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {tUpload("genericError")}
          </p>
        )}
        {!greeting && (
          <input
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            onBlur={() => {
              if (guestName.trim()) void mintSession(guestName);
            }}
            placeholder={t("namePlaceholder")}
            aria-label={t("nameLabel")}
            maxLength={80}
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          />
        )}
      </header>
      <main>
        {tab === "upload" && <GuestUploadView eventId={eventId} accent={accent} />}
        {tab === "gallery" && <div data-testid="gallery-placeholder" />}
        {tab === "moments" && <div data-testid="moments-placeholder" />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-white/95 backdrop-blur">
        {(["upload", "gallery", "moments"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className="min-h-14 flex-1 text-sm font-medium"
            style={{ color: tab === value ? accent : undefined }}
          >
            {t(`tabs.${value}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}
