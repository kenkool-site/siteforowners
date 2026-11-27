// Builds "1 video", "2 photos & 1 video", and the Spanish "2 fotos y 1 video"
// from already-pluralized pieces. The phrases come from next-intl so this
// stays free of hardcoded English.
export function formatMediaSummary(
  photos: number,
  videos: number,
  text: {
    photos: (count: number) => string;
    videos: (count: number) => string;
    join: (left: string, right: string) => string;
  },
): string {
  const photoLabel = photos > 0 ? text.photos(photos) : "";
  const videoLabel = videos > 0 ? text.videos(videos) : "";
  if (photoLabel && videoLabel) return text.join(photoLabel, videoLabel);
  return photoLabel || videoLabel;
}
