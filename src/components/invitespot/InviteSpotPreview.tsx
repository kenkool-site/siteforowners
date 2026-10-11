"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { CalendarDays, MapPin, Menu, Camera, Upload, QrCode, X, ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./styles";

type Occasion = "wedding" | "birthday" | "naming";
const photos = ["wedding-portrait", "wedding-guests", "wedding-table", "wedding-dance", "wedding-flowers", "wedding-sparklers"];

function PreviewDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useTranslations("invitespot.preview");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={styles.dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-label={t("sample")}>
    <button type="button" className={styles.close} onClick={onClose} aria-label={t("close")}><X size={20} /></button>{children}
  </dialog>;
}

export function InvitationPreview({ occasion = "wedding", hero = false }: { occasion?: Occasion; hero?: boolean }) {
  const t = useTranslations("invitespot.preview");
  const [open, setOpen] = useState(false);
  return <>
    <div className={`${styles.invitation} ${occasion === "wedding" ? "" : styles[occasion]} ${hero ? styles.heroInvitation : ""}`}>
      <div className={styles.invitationContent}>
        <div className={styles.previewTop}><span>{t(`${occasion}Title`)}</span><Menu size={14} aria-hidden="true" /></div>
        <p className={styles.invitationIntro}>{t(`${occasion}Intro`)}</p>
        <h3>{t(`${occasion}Title`)}</h3>
        <p className={styles.invitationMessage}>{t(`${occasion}Message`)}</p>
        <div className={styles.eventDetail}><CalendarDays size={14} aria-hidden="true" /><span>{t("date")}</span></div>
        <div className={styles.eventDetail}><MapPin size={14} aria-hidden="true" /><span>{t(`${occasion}Venue`)}</span></div>
        <button type="button" onClick={() => setOpen(true)} className={styles.rsvp}>{t("rsvp")} <span aria-hidden="true">→</span></button>
      </div>
      <div className={styles.invitationPhoto}><Image src={`/invitespot/photos/${occasion === "wedding" ? "wedding-portrait" : occasion === "naming" ? "family" : "birthday"}.webp`} alt={t(`${occasion}Alt`)} fill sizes={hero ? "(max-width: 767px) 45vw, 300px" : "(max-width: 767px) 80vw, 240px"} className="object-cover" priority={hero} /></div>
    </div>
    {open && <PreviewDialog onClose={() => setOpen(false)}><h3>{t(`${occasion}Title`)}</h3><p>{t("rsvpHelp")}</p><a className={styles.primary} href="#event-form" onClick={() => setOpen(false)}>{t("rsvp")}</a></PreviewDialog>}
  </>;
}

export function GalleryPreview({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("invitespot.preview");
  const [selected, setSelected] = useState<number | null>(null);
  const [upload, setUpload] = useState(false);
  const [album, setAlbum] = useState(false);
  const visiblePhotos = album ? photos.slice(1) : photos;
  return <>
    <div className={`${styles.gallery} ${compact ? styles.compactGallery : ""}`}>
      <div className={styles.galleryHeader}><Camera size={18} aria-hidden="true" /><div><h3>{t("galleryTitle")}</h3><p>{t("weddingTitle")}</p></div><button type="button" onClick={() => setUpload(true)}><Upload size={13} aria-hidden="true" />{t("addPhotos")}</button></div>
      {!compact && <div className={styles.albumTabs}><button type="button" aria-pressed={!album} onClick={() => setAlbum(false)}>{t("album")}</button><button type="button" aria-pressed={album} onClick={() => setAlbum(true)}>{t("smartAlbum")}</button></div>}
      <div className={styles.galleryBody}><div className={styles.photoGrid}>{visiblePhotos.map((photo) => <button type="button" key={photo} onClick={() => setSelected(photos.indexOf(photo))} aria-label={t("viewPhoto", { number: photos.indexOf(photo) + 1 })}><Image src={`/invitespot/photos/${photo}.webp`} alt={t("photoAlt")} fill sizes={compact ? "(max-width: 767px) 30vw, 150px" : "(max-width: 767px) 28vw, 220px"} className="object-cover" /></button>)}</div>{!compact && <div className={styles.scan}><QrCode size={54} strokeWidth={1.2} aria-hidden="true" /><strong>{t("scan")}</strong><span>{t("sample")}</span></div>}</div>
    </div>
    {upload && <PreviewDialog onClose={() => setUpload(false)}><h3>{t("addPhotos")}</h3><p>{t("uploadHelp")}</p><p className={styles.muted}>{t("sampleHelp")}</p></PreviewDialog>}
    {selected !== null && <PreviewDialog onClose={() => setSelected(null)}><div className={styles.lightboxPhoto}><Image src={`/invitespot/photos/${photos[selected]}.webp`} alt={t("photoAlt")} fill sizes="(max-width: 767px) 90vw, 800px" className="object-contain" /></div><div className={styles.lightboxNav}><button type="button" aria-label={t("previous")} onClick={() => setSelected((selected + photos.length - 1) % photos.length)}><ArrowLeft /></button><span>{selected + 1} / {photos.length}</span><button type="button" aria-label={t("next")} onClick={() => setSelected((selected + 1) % photos.length)}><ArrowRight /></button></div></PreviewDialog>}
  </>;
}
