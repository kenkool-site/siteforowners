"use client";

import { useCallback, useEffect, useState } from "react";
import { Images, Sparkles, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import { GuestUploadView } from "./GuestUploadView";
import { GuestGalleryView } from "./GuestGalleryView";
import { GuestMomentsView } from "./GuestMomentsView";
import { GuestAiHighlightView } from "./GuestAiHighlightView";

type Tab = "gallery" | "moments" | "highlights";

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
  eventTitle,
  accent,
  background,
  text,
  surface,
}: {
  eventId: string;
  eventTitle: string;
  accent: string;
  background: string;
  text: string;
  surface: string;
}) {
  const t = useTranslations("invitations.public.memories.landing");
  const tUpload = useTranslations("invitations.public.memories.upload");
  const [tab, setTab] = useState<Tab>("gallery");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [uploads, setUploads] = useState<GuestUploadPreview[]>([]);
  const handleUploadsChange = useCallback((items: GuestUploadPreview[]) => setUploads(items), []);

  async function mintSession(name?: string) {
    const credential = rsvpCredentialFromUrl();
    try {
      const res = await fetch(`/api/memories/events/${eventId}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rsvpId: credential?.rsvpId, editToken: credential?.editToken, guestName: name?.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`session mint responded with status ${res.status}`);
      const data = (await res.json()) as { level: "anonymous" | "rsvp_guest"; guestName: string | null };
      if (data.guestName) {
        setGreeting(data.guestName);
        setGuestName(data.guestName);
      } else if (name?.trim()) {
        setGreeting(name.trim());
      }
      setSessionError(false);
    } catch (error) {
      console.error("[memories] session mint failed", { error });
      setSessionError(true);
    }
  }

  useEffect(() => {
    void mintSession().finally(() => setSessionReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!sessionReady) return null;

  const displayName = greeting || guestName.trim();
  const initial = displayName ? Array.from(displayName)[0]?.toUpperCase() : "+";

  return (
    <div style={{ backgroundColor: background, color: text }} className="min-h-screen pb-20">
      <div className="mx-auto min-h-screen max-w-2xl">
        <header className="flex items-start justify-between gap-4 px-5 pb-5 pt-6 sm:px-7">
          <div className="min-w-0">
            <h1 className="font-serif text-[2.15rem] font-semibold leading-[0.95] tracking-[-0.035em] sm:text-5xl">{t("title")}</h1>
            <p className="mt-2 truncate font-serif text-xl sm:text-2xl" style={{ color: accent }}>{eventTitle}</p>
          </div>
          {!editingName && (
            <button type="button" onClick={() => setEditingName(true)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: surface, outlineColor: accent }}>
              <span className="grid size-8 place-items-center rounded-full font-semibold" style={{ backgroundColor: `${accent}18`, color: accent }}>{initial}</span>
              <span className="max-w-[8rem] truncate">{displayName ? t("identity", { name: displayName }) : t("addName")}</span>
            </button>
          )}
        </header>

        {editingName && <div className="mx-5 mb-5 flex items-center gap-2 sm:mx-7">
          <input autoFocus type="text" value={guestName} onChange={(event) => setGuestName(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (guestName.trim()) void mintSession(guestName);
              setEditingName(false);
            }
          }} placeholder={t("namePlaceholder")} aria-label={t("nameLabel")} maxLength={80} className="min-h-11 flex-1 rounded-full border bg-white/80 px-4 text-sm" style={{ borderColor: `${accent}40` }} />
          <button type="button" onClick={() => { if (guestName.trim()) void mintSession(guestName); setEditingName(false); }} className="min-h-11 rounded-full px-4 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>{t("saveName")}</button>
        </div>}

        {sessionError && <p role="alert" className="mx-5 mb-3 text-sm text-red-700 sm:mx-7">{tUpload("genericError")}</p>}

        <main>
          {tab === "gallery" && <GuestGalleryView eventId={eventId} accent={accent} surface={surface} uploads={uploads} />}
          {tab === "moments" && <GuestMomentsView eventId={eventId} accent={accent} surface={surface} />}
          {tab === "highlights" && <GuestAiHighlightView eventId={eventId} accent={accent} surface={surface} />}
        </main>

        {tab === "gallery" && <GuestUploadView eventId={eventId} accent={accent} onItemsChange={handleUploadsChange} />}
      </div>

      <nav aria-label={t("navigationLabel")} className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 backdrop-blur" style={{ borderColor: `${accent}20` }}>
        <div className="mx-auto grid h-[4.25rem] max-w-2xl grid-cols-3">
          {(["gallery", "highlights", "moments"] as const).map((value) => {
            const Icon = value === "gallery" ? Images : value === "moments" ? Users : Sparkles;
            const active = tab === value;
            return <button key={value} type="button" onClick={() => setTab(value)} aria-current={active ? "page" : undefined} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold" style={{ color: active ? accent : `${text}88` }}>
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              {t(`tabs.${value}`)}
              {active && <span className="absolute inset-x-[30%] bottom-0 h-0.5 rounded-full" style={{ backgroundColor: accent }} />}
            </button>;
          })}
        </div>
      </nav>
    </div>
  );
}
