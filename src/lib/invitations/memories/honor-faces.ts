import sharp from "sharp";

export interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
  confidence?: number;
}

export const HONOR_SIMILARITY_THRESHOLD = 80;

export function facesLeftToRight<T extends FaceBox>(faces: T[]): T[] {
  return [...faces].sort((a, b) => a.left - b.left || a.top - b.top);
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export async function cropFaceJpeg(bytes: Uint8Array, box: FaceBox, padding = 0.45): Promise<Uint8Array> {
  const image = sharp(bytes, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 2 || height < 2) throw new Error("image is too small to crop a face");
  const left = clampUnit(box.left - box.width * padding);
  const top = clampUnit(box.top - box.height * padding);
  const right = clampUnit(box.left + box.width * (1 + padding));
  const bottom = clampUnit(box.top + box.height * (1 + padding));
  const cropLeft = Math.min(width - 1, Math.floor(left * width));
  const cropTop = Math.min(height - 1, Math.floor(top * height));
  const cropWidth = Math.max(1, Math.min(width - cropLeft, Math.ceil((right - left) * width)));
  const cropHeight = Math.max(1, Math.min(height - cropTop, Math.ceil((bottom - top) * height)));
  const output = await sharp(bytes, { failOn: "none" })
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Uint8Array(output);
}

export interface HonorCrop {
  honoreeId: string;
  bytes: Uint8Array;
}

export interface HonorTarget {
  mediaId: string;
  bytes: Uint8Array;
}

export interface HonorSimilarity {
  mediaId: string;
  honoreeId: string;
  similarity: number;
}

export async function compareHonoreeCrops(
  crops: HonorCrop[],
  targets: HonorTarget[],
  compareFaces: (source: Uint8Array, target: Uint8Array, threshold: number) => Promise<number>,
  threshold = HONOR_SIMILARITY_THRESHOLD,
  concurrency = 4,
): Promise<HonorSimilarity[]> {
  const jobs: Array<() => Promise<HonorSimilarity | null>> = [];
  for (const crop of crops) {
    for (const target of targets) {
      jobs.push(async () => {
        const similarity = await compareFaces(crop.bytes, target.bytes, threshold);
        if (similarity < threshold) return null;
        return { mediaId: target.mediaId, honoreeId: crop.honoreeId, similarity };
      });
    }
  }
  const results: HonorSimilarity[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      const match = await jobs[index]();
      if (match) results.push(match);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return results;
}
