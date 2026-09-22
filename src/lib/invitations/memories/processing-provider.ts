export interface DerivativeResult {
  displayBytes: Uint8Array;
  thumbnailBytes: Uint8Array;
}

export interface ProcessingProvider {
  process(original: Uint8Array): Promise<DerivativeResult>;
}

export function deriveObjectKeys(eventId: string, mediaId: string): { display: string; thumbnail: string } {
  return {
    display: `display/${eventId}/${mediaId}.webp`,
    thumbnail: `thumbnails/${eventId}/${mediaId}.webp`,
  };
}
