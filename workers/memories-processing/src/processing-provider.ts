import { PhotonImage, resize, rotate, fliph, flipv, SamplingFilter } from "@cf-wasm/photon";

export interface DerivativeResult {
  displayBytes: Uint8Array;
  thumbnailBytes: Uint8Array;
  moderationBytes: Uint8Array;
}

const DISPLAY_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;

// Phone cameras commonly store a photo's raw sensor pixel data as-is and
// record how it should be displayed via the EXIF Orientation tag, rather
// than physically rotating pixels at capture time. photon-rs decodes only
// raw pixel data — it has no awareness of EXIF — so without reading this
// tag ourselves, every derivative we produce silently inherits the sensor's
// raw orientation instead of the one the photo was actually taken in,
// which is why guest uploads have been showing up sideways.
//
// Minimal, targeted parser: walks JPEG marker segments looking for APP1's
// "Exif\0\0" + TIFF header, then reads just the Orientation tag (0x0112)
// out of the first IFD. Returns 1 (no transform) for anything else —
// non-JPEG bytes, no EXIF segment, or a malformed/out-of-range value —
// which is always a safe, correct default (1 is "already upright").
export function readJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) break; // Start of Scan — no more metadata markers follow.
    const segmentLength = view.getUint16(offset + 2, false);
    if (marker === 0xe1 && segmentLength >= 8) {
      const exifStart = offset + 4;
      const isExif =
        bytes[exifStart] === 0x45 &&
        bytes[exifStart + 1] === 0x78 &&
        bytes[exifStart + 2] === 0x69 &&
        bytes[exifStart + 3] === 0x66 &&
        bytes[exifStart + 4] === 0x00 &&
        bytes[exifStart + 5] === 0x00;
      if (isExif) {
        const tiffStart = exifStart + 6;
        const little = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
        const big = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
        if (little || big) {
          const ifdOffset = view.getUint32(tiffStart + 4, little);
          const ifdStart = tiffStart + ifdOffset;
          if (ifdStart + 2 <= bytes.length) {
            const entryCount = view.getUint16(ifdStart, little);
            for (let i = 0; i < entryCount; i++) {
              const entryOffset = ifdStart + 2 + i * 12;
              if (entryOffset + 12 > bytes.length) break;
              const tag = view.getUint16(entryOffset, little);
              if (tag === 0x0112) {
                const value = view.getUint16(entryOffset + 8, little);
                return value >= 1 && value <= 8 ? value : 1;
              }
            }
          }
        }
      }
    }
    offset += 2 + segmentLength;
  }

  return 1;
}

// rotate() returns a new PhotonImage rather than mutating in place (unlike
// fliph/flipv), so the caller's old reference must be freed once the
// rotated copy comes back, or it leaks in the WASM heap.
function rotateAndFree(image: PhotonImage, degrees: number): PhotonImage {
  const rotated = rotate(image, degrees);
  image.free();
  return rotated;
}

// Normalizes a decoded image to upright, per the standard EXIF orientation
// table (values 5 and 7 are the rare mirrored-and-rotated cases; 1 needs no
// transform at all).
export function applyOrientation(image: PhotonImage, orientation: number): PhotonImage {
  switch (orientation) {
    case 2:
      fliph(image);
      return image;
    case 3:
      return rotateAndFree(image, 180);
    case 4:
      flipv(image);
      return image;
    case 5:
      fliph(image);
      return rotateAndFree(image, 270);
    case 6:
      return rotateAndFree(image, 90);
    case 7:
      fliph(image);
      return rotateAndFree(image, 90);
    case 8:
      return rotateAndFree(image, 270);
    default:
      return image;
  }
}

export async function process(original: Uint8Array): Promise<DerivativeResult> {
  const decoded = PhotonImage.new_from_byteslice(original);
  const orientation = readJpegOrientation(original);
  try {
    // Resize BEFORE correcting orientation, not after: rotate() allocates a
    // second full buffer at its INPUT resolution, and a modern phone photo
    // (12+MP) rotated at full size can exceed a Cloudflare Worker's isolate
    // memory limit — confirmed in production via `wrangler tail` against a
    // real failing upload: "RangeError: Invalid array buffer length" inside
    // this pipeline, for photos needing rotation specifically. Resizing
    // first means rotate() only ever runs on an already-small (<=1600px)
    // image regardless of the original's resolution. Final dimensions are
    // identical either order: resize's target is based on max(width,
    // height), which a 90/270 rotation only swaps, never changes.
    const displayResized = resizeToMax(decoded, DISPLAY_MAX_DIMENSION);
    const thumbnailResized = resizeToMax(decoded, THUMBNAIL_MAX_DIMENSION);
    const display = applyOrientation(displayResized, orientation);
    const thumbnail = applyOrientation(thumbnailResized, orientation);
    try {
      return {
        displayBytes: display.get_bytes_webp(),
        thumbnailBytes: thumbnail.get_bytes_webp(),
        moderationBytes: display.get_bytes_jpeg(85),
      };
    } finally {
      display.free();
      thumbnail.free();
    }
  } finally {
    decoded.free();
  }
}

function resizeToMax(image: PhotonImage, maxDimension: number): PhotonImage {
  const width = image.get_width();
  const height = image.get_height();
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  return resize(image, targetWidth, targetHeight, SamplingFilter.Lanczos3);
}
