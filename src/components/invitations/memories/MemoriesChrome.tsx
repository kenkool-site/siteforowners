"use client";

import type { ReactNode } from "react";
import { Camera, ChevronDown, Clock3, Images, Mail, ScanFace, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { invitespotGuestUrl } from "@/lib/invitations/memories/guest-presentation";

export type MemoriesTab = "gallery" | "highlights" | "moments" | "find";

export function MemoriesTopBar({
  branding,
  displayName,
  accent,
  surface,
  text,
  onAbout,
  onEditName,
}: {
  branding: boolean;
  displayName: string;
  accent: string;
  surface: string;
  text: string;
  onAbout: () => void;
  onEditName: () => void;
}) {
  const t = useTranslations("invitations.public.memories.redesign");
  const tLanding = useTranslations("invitations.public.memories.landing");
  const initial = displayName ? Array.from(displayName)[0]?.toUpperCase() : "";
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
      {branding ? (
        <button type="button" onClick={onAbout} className="inline-flex h-9 items-center gap-1.5 rounded-full border px-1.5 pr-2.5 text-sm font-semibold" style={{ backgroundColor: `${surface}cc`, borderColor: `${accent}22`, color: text }}>
          <span className="grid size-6 place-items-center rounded-lg font-serif text-sm text-white" style={{ backgroundColor: accent }}>i</span>
          {t("brand")}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      ) : <span />}
      <button type="button" onClick={onEditName} className="inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold" style={{ backgroundColor: surface, borderColor: `${accent}22`, color: accent }}>
        <span className="grid size-7 place-items-center rounded-full text-xs font-bold" style={{ backgroundColor: displayName ? "#e9d6af" : `${accent}14`, color: text }}>
          {initial || <ScanFace className="size-3.5" />}
        </span>
        <span className="truncate">{displayName || tLanding("addName")}</span>
      </button>
    </div>
  );
}

export function MemoriesTabBar({
  tab,
  accent,
  background,
  text,
  onTab,
  onAdd,
}: {
  tab: MemoriesTab;
  accent: string;
  background: string;
  text: string;
  onTab: (tab: MemoriesTab) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("invitations.public.memories.redesign");
  const tLanding = useTranslations("invitations.public.memories.landing");
  const items: Array<{ id: MemoriesTab | "add"; label: string; icon: ReactNode }> = [
    { id: "gallery", label: t("navGallery"), icon: <Images className="size-5" /> },
    { id: "highlights", label: t("navHighlights"), icon: <Sparkles className="size-5" /> },
    { id: "add", label: t("navAdd"), icon: <Camera className="size-6" /> },
    { id: "moments", label: t("navMoments"), icon: <Clock3 className="size-5" /> },
    { id: "find", label: t("navFind"), icon: <ScanFace className="size-5" /> },
  ];
  return (
    <nav aria-label={tLanding("navigationLabel")} className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur" style={{ backgroundColor: `${background}f5`, borderColor: `${accent}22` }}>
      <div className="mx-auto grid h-[5.4rem] max-w-2xl grid-cols-5 px-1 pt-2">
        {items.map((item) => item.id === "add" ? (
          <button key="add" type="button" onClick={onAdd} className="flex -mt-6 flex-col items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
            <span className="grid size-14 place-items-center rounded-full border-4 text-white shadow-lg" style={{ backgroundColor: accent, borderColor: background }}><Camera className="size-6" /></span>
            {item.label}
          </button>
        ) : (
          <button key={item.id} type="button" onClick={() => { if (item.id !== "add") onTab(item.id); }} aria-current={tab === item.id ? "page" : undefined} className="flex flex-col items-center gap-1 text-[11px] font-semibold" style={{ color: tab === item.id ? accent : `${text}88` }}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function AboutInviteSpotSheet({
  eventTitle,
  slug,
  accent,
  surface,
  text,
  onClose,
}: {
  eventTitle: string;
  slug: string;
  accent: string;
  surface: string;
  text: string;
  onClose: () => void;
}) {
  const t = useTranslations("invitations.public.memories.redesign");
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/55" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="about-invitespot-title" className="mx-auto w-full max-w-2xl rounded-t-3xl px-5 pb-10 pt-3 text-center shadow-2xl" style={{ backgroundColor: surface, color: text }} onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/10" />
        <div className="mx-auto grid size-14 place-items-center rounded-2xl font-serif text-3xl text-white" style={{ backgroundColor: accent }}>i</div>
        <h2 id="about-invitespot-title" className="mt-3 font-serif text-2xl font-semibold" style={{ color: accent }}>{t("aboutTitle")}</h2>
        <p className="mx-2 mt-1 text-sm leading-6 opacity-70">{t("aboutPitch", { event: eventTitle })}</p>
        <ul className="mt-4 grid gap-2 text-left text-sm font-medium">
          {[
            [Mail, t("featureInvite")],
            [Camera, t("featurePhotos")],
            [Sparkles, t("featureHighlights")],
          ].map(([Icon, label]) => (
            <li key={String(label)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ backgroundColor: `${accent}0d` }}>
              <Icon className="size-4 shrink-0" style={{ color: accent }} />
              {label as string}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          <a className="inline-flex h-14 items-center justify-center rounded-full text-base font-semibold text-white" style={{ backgroundColor: accent }} href={invitespotGuestUrl(slug, "about_get")} target="_blank" rel="noreferrer">{t("getOne")}</a>
          <a className="inline-flex h-12 items-center justify-center rounded-full border text-sm font-semibold" style={{ color: accent, borderColor: `${accent}33` }} href={invitespotGuestUrl(slug, "about_how")} target="_blank" rel="noreferrer">{t("howItWorks")}</a>
        </div>
        <p className="mt-3 text-xs opacity-60">{t("aboutFoot")}</p>
        <button type="button" onClick={onClose} aria-label={t("cancel")} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full" style={{ backgroundColor: `${accent}12` }}><X className="size-4" /></button>
      </div>
    </div>
  );
}

export function PlanningEndCard({ slug, accent, surface, text }: { slug: string; accent: string; surface: string; text: string }) {
  const t = useTranslations("invitations.public.memories.redesign");
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border" style={{ backgroundColor: surface, borderColor: `${accent}22`, color: text }}>
      <div className="flex gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl font-serif text-lg text-white" style={{ backgroundColor: accent }}>i</span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">{t("madeWith")}</p>
          <p className="font-serif text-lg font-semibold leading-tight" style={{ color: accent }}>{t("planning")}</p>
          <p className="mt-1 text-xs leading-5 opacity-70">{t("productPitch")}</p>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <a className="inline-flex h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: accent }} href={invitespotGuestUrl(slug, "end_card")} target="_blank" rel="noreferrer">{t("getOne")}</a>
        <a className="inline-flex h-11 flex-1 items-center justify-center rounded-full border text-sm font-semibold" style={{ color: accent, borderColor: `${accent}33` }} href={invitespotGuestUrl(slug, "end_how")} target="_blank" rel="noreferrer">{t("howShort")}</a>
      </div>
    </section>
  );
}

export function MadeWithFooter({ slug, accent }: { slug: string; accent: string }) {
  const t = useTranslations("invitations.public.memories.redesign");
  return (
    <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs opacity-70">
      <span className="grid size-4 place-items-center rounded font-serif text-[9px] text-white" style={{ backgroundColor: accent }}>i</span>
      {t("madeWith")}
      <span aria-hidden="true">·</span>
      <a className="font-semibold" style={{ color: accent }} href={invitespotGuestUrl(slug, "footer")} target="_blank" rel="noreferrer">{t("getPage")}</a>
    </p>
  );
}

export function PlanningSoftLink({ slug, accent, surface, text, content }: { slug: string; accent: string; surface: string; text: string; content: "success" | "album" }) {
  const t = useTranslations("invitations.public.memories.redesign");
  return (
    <a href={invitespotGuestUrl(slug, content)} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-2xl border p-3 text-left" style={{ backgroundColor: surface, borderColor: `${accent}22`, color: text }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg font-serif text-base text-white" style={{ backgroundColor: accent }}>i</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{content === "success" ? t("planningShort") : t("madeWith")}</span>
        <span className="block text-xs opacity-70">{content === "success" ? t("planningHint") : t("planning")}</span>
      </span>
    </a>
  );
}
