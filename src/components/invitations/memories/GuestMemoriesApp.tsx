"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GuestMemoriesContext } from "@/lib/invitations/memories/guest-presentation";
import { guestNameStorageKey } from "@/lib/invitations/memories/guest-presentation";
import type { GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import type { GuestHighlightGroup } from "./GuestAiHighlightView";
import { GuestAiHighlightView } from "./GuestAiHighlightView";
import { GuestGalleryView } from "./GuestGalleryView";
import { GuestMomentsView } from "./GuestMomentsView";
import { GuestUploadView } from "./GuestUploadView";
import { FindMeFlow } from "./FindMeFlow";
import { AboutInviteSpotSheet, MemoriesTabBar, MemoriesTopBar, type MemoriesTab } from "./MemoriesChrome";
import type { MediaImageSrc } from "./media-src";

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
  findMeEnabled,
  slug = "",
  startsAt = null,
  timeZone = "UTC",
  venueName = null,
  address = null,
  eventType = "event",
  locale = "en",
  brandingEnabled = true,
  schedule = [],
  preview,
}: {
  eventId: string;
  eventTitle: string;
  accent: string;
  background: string;
  text: string;
  surface: string;
  findMeEnabled: boolean;
  slug?: string;
  startsAt?: string | null;
  timeZone?: string;
  venueName?: string | null;
  address?: string | null;
  eventType?: string;
  locale?: string;
  brandingEnabled?: boolean;
  schedule?: GuestMemoriesContext["schedule"];
  preview?: {
    now?: number;
    media?: PublicMemoryMedia[];
    moments?: MemoryMoment[];
    highlights?: GuestHighlightGroup[];
    viewerMediaIds?: string[];
    imageSrc?: MediaImageSrc;
    openViewer?: boolean;
    openFind?: boolean;
    findResults?: PublicMemoryMedia[];
    openAbout?: boolean;
    screen?: string;
    uploadStep?: "name" | "source" | "review" | "uploading" | "browsing" | "success";
    uploadPreviews?: string[];
  } | null;
}) {
  const tUpload = useTranslations("invitations.public.memories.upload");
  const tLanding = useTranslations("invitations.public.memories.landing");
  const tr = useTranslations("invitations.public.memories.redesign");
  const initialTab: MemoriesTab = preview?.screen === "highlights" || preview?.screen === "highlights-empty" || preview?.screen === "highlights-loading"
    ? "highlights"
    : preview?.screen === "moments"
      ? "moments"
      : preview?.screen === "find"
        ? "find"
        : "gallery";
  const [tab, setTab] = useState<MemoriesTab>(initialTab);
  const [sessionReady, setSessionReady] = useState(Boolean(preview));
  const [sessionError, setSessionError] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [uploads, setUploads] = useState<GuestUploadPreview[]>([]);
  const [aboutOpen, setAboutOpen] = useState(Boolean(preview?.openAbout));
  const [findOpen, setFindOpen] = useState(Boolean(preview?.openFind || preview?.screen === "find" || preview?.findResults?.length));
  const openUpload = useRef<(momentId?: string) => void>(() => undefined);
  const handleUploadsChange = useCallback((items: GuestUploadPreview[]) => setUploads(items), []);

  const context: GuestMemoriesContext = {
    eventId,
    slug,
    title: eventTitle,
    eventType,
    startsAt,
    timeZone,
    venueName,
    address,
    locale,
    findMeEnabled,
    brandingEnabled,
    schedule,
  };

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
    try {
      const stored = window.localStorage.getItem(guestNameStorageKey(eventId));
      if (stored) {
        setGuestName(stored);
        setGreeting(stored);
      }
    } catch { /* private mode */ }
    if (preview) return;
    void mintSession().finally(() => setSessionReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function rememberName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGuestName(trimmed);
    setGreeting(trimmed);
    try { window.localStorage.setItem(guestNameStorageKey(eventId), trimmed); } catch { /* private mode */ }
    void mintSession(trimmed);
  }

  if (!sessionReady) return null;

  const displayName = greeting || guestName.trim();
  const previewGallery = preview?.media ? { media: preview.media, moments: preview.moments ?? [], viewerMediaIds: preview.viewerMediaIds, viewerKnown: Boolean(preview.viewerMediaIds?.length), now: preview.now } : null;

  return (
    <div style={{ backgroundColor: background, color: text }} className="min-h-screen">
      <div className="mx-auto min-h-screen max-w-2xl">
        <MemoriesTopBar branding={brandingEnabled} displayName={displayName} accent={accent} surface={surface} text={text} onAbout={() => setAboutOpen(true)} onEditName={() => setEditingName(true)} />
        {editingName && <div className="mx-4 mb-4 flex items-center gap-2">
          <input autoFocus type="text" value={guestName} onChange={(event) => setGuestName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { rememberName(guestName); setEditingName(false); } }} maxLength={80} className="min-h-11 flex-1 rounded-full border bg-white/80 px-4 text-sm" style={{ borderColor: `${accent}40` }} />
          <button type="button" onClick={() => { rememberName(guestName); setEditingName(false); }} className="min-h-11 rounded-full px-4 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>{tLanding("saveName")}</button>
        </div>}
        {sessionError && <p role="alert" className="mx-4 mb-3 text-sm text-red-700">{tUpload("genericError")}</p>}
        <main>
          {tab === "gallery" && (
            <GuestGalleryView
              context={context}
              accent={accent}
              surface={surface}
              uploads={uploads}
              onAddPhotos={() => openUpload.current()}
              onFindMe={() => setFindOpen(true)}
              imageSrc={preview?.imageSrc}
              preview={previewGallery}
              openViewer={preview?.openViewer}
            />
          )}
          {tab === "moments" && (
            <GuestMomentsView
              eventId={eventId}
              accent={accent}
              surface={surface}
              timeZone={timeZone}
              locale={locale}
              onAddPhotos={() => openUpload.current()}
              onShowGallery={() => setTab("gallery")}
              imageSrc={preview?.imageSrc}
              preview={preview?.media ? { media: preview.media, moments: preview.moments ?? [], now: preview.now } : null}
            />
          )}
          {tab === "highlights" && (
            <GuestAiHighlightView
              eventId={eventId}
              accent={accent}
              surface={surface}
              previewGroups={preview?.screen === "highlights-loading" ? undefined : preview?.highlights}
              forceLoading={preview?.screen === "highlights-loading"}
              imageSrc={preview?.imageSrc}
            />
          )}
          {tab === "find" && !findOpen && (
            <div className="px-4 pb-36">
              <button type="button" onClick={() => findMeEnabled && setFindOpen(true)} className="font-serif text-3xl font-semibold" style={{ color: accent }}>{tr("navFind")}</button>
            </div>
          )}
        </main>
        <GuestUploadView
          eventId={eventId}
          accent={accent}
          eventTitle={eventTitle}
          guestName={displayName}
          onGuestName={rememberName}
          moments={preview?.moments}
          branding={brandingEnabled}
          slug={slug}
          onSeeGallery={() => setTab("gallery")}
          onItemsChange={handleUploadsChange}
          onBind={(api) => { openUpload.current = api.open; }}
          demo={preview?.uploadStep ? { step: preview.uploadStep, name: "Chanelle", previews: preview.uploadPreviews } : null}
        />
      </div>
      <MemoriesTabBar tab={tab} accent={accent} background={background} text={text} onTab={(next) => { setTab(next); if (next === "find" && findMeEnabled) setFindOpen(true); }} onAdd={() => openUpload.current()} />
      {aboutOpen && brandingEnabled && <AboutInviteSpotSheet eventTitle={eventTitle} slug={slug} accent={accent} surface={surface} text={text} onClose={() => setAboutOpen(false)} />}
      {findOpen && findMeEnabled && (
        <FindMeFlow
          eventId={eventId}
          accent={accent}
          surface={surface}
          eventTitle={eventTitle}
          photoCount={preview?.media?.length ?? 0}
          slug={slug}
          branding={brandingEnabled}
          previewResults={preview?.findResults}
          imageSrc={preview?.imageSrc}
          onClose={() => { setFindOpen(false); if (tab === "find") setTab("gallery"); }}
        />
      )}
    </div>
  );
}
