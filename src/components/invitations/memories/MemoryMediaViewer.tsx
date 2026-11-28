"use client";

import { useMemo } from "react";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { watchableVideos } from "@/lib/invitations/memories/guest-presentation";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import { GuestVideoPlayer } from "./GuestVideoPlayer";
import { MediaLightbox, type MediaLightboxProps } from "./MediaLightbox";
import type { MediaImageSrc } from "./media-src";

// Opens a tapped photo or video the way the Gallery does: photos in the
// full-screen photo viewer and videos in the full-screen video player, each
// swiping through that section's items of the same kind.
export function MemoryMediaViewer({
  media,
  openId,
  onOpen,
  moments,
  imageSrc,
  adaptiveSrc,
  timeZone,
  locale,
  accent,
  onFindMe,
  honorLabels,
  honorIcon,
}: {
  media: PublicMemoryMedia[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  moments?: MemoryMoment[];
  imageSrc?: MediaImageSrc;
  adaptiveSrc?: (id: string) => string;
  timeZone?: string | null;
  locale?: string;
  accent?: string;
  onFindMe?: () => void;
  honorLabels?: MediaLightboxProps["honorLabels"];
  honorIcon?: MediaLightboxProps["honorIcon"];
}) {
  const photos = useMemo(() => media.filter((item) => item.mediaKind !== "video"), [media]);
  const videos = useMemo(() => watchableVideos(media), [media]);
  if (openId === null) return null;
  const videoIndex = videos.findIndex((item) => item.id === openId);
  if (videoIndex !== -1) {
    return (
      <GuestVideoPlayer
        videos={videos}
        index={videoIndex}
        moments={moments}
        imageSrc={imageSrc}
        adaptiveSrc={adaptiveSrc}
        timeZone={timeZone}
        locale={locale}
        accent={accent}
        onFindMe={onFindMe}
        onClose={() => onOpen(null)}
        onNavigate={(index) => onOpen(videos[index]?.id ?? null)}
      />
    );
  }
  const photoIndex = photos.findIndex((item) => item.id === openId);
  if (photoIndex === -1) return null;
  return (
    <MediaLightbox
      media={photos}
      index={photoIndex}
      moments={moments}
      imageSrc={imageSrc}
      timeZone={timeZone}
      locale={locale}
      onFindMe={onFindMe}
      honorLabels={honorLabels}
      honorIcon={honorIcon}
      onClose={() => onOpen(null)}
      onNavigate={(index) => onOpen(photos[index]?.id ?? null)}
    />
  );
}
