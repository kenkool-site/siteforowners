import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

export interface DerivativeResult {
  displayBytes: Uint8Array;
  thumbnailBytes: Uint8Array;
}

const DISPLAY_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;

export async function process(original: Uint8Array): Promise<DerivativeResult> {
  const image = PhotonImage.new_from_byteslice(original);
  try {
    const display = resizeToMax(image, DISPLAY_MAX_DIMENSION);
    const thumbnail = resizeToMax(image, THUMBNAIL_MAX_DIMENSION);
    return {
      displayBytes: display.get_bytes_webp(),
      thumbnailBytes: thumbnail.get_bytes_webp(),
    };
  } finally {
    image.free();
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
