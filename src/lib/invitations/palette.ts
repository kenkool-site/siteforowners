import sharp from "sharp";

type Cluster = { r: number; g: number; b: number; count: number };
const quantize = (value: number) => Math.min(240, Math.round(value / 16) * 16);
const distance = (a: Cluster, b: Cluster) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0").toUpperCase();

export async function extractInvitationPalette(bytes: Uint8Array): Promise<string[]> {
  let data: Buffer;
  try {
    data = await sharp(bytes).resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true }).flatten({ background: "#FFFFFF" }).removeAlpha().raw().toBuffer();
  } catch (error) {
    throw new Error("Invitation image could not be analyzed", { cause: error });
  }
  const buckets = new Map<string, Cluster>();
  for (let index = 0; index < data.length; index += 3) {
    const r = quantize(data[index]!), g = quantize(data[index + 1]!), b = quantize(data[index + 2]!);
    const key = `${r},${g},${b}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { r, g, b, count: 1 });
  }
  const minimum = data.length / 3 * 0.01;
  const clusters: Cluster[] = [];
  for (const candidate of Array.from(buckets.values()).sort((a, b) => b.count - a.count)) {
    if (candidate.count < minimum) continue;
    const existing = clusters.find((cluster) => distance(cluster, candidate) < 28);
    if (existing) {
      const total = existing.count + candidate.count;
      existing.r = (existing.r * existing.count + candidate.r * candidate.count) / total;
      existing.g = (existing.g * existing.count + candidate.g * candidate.count) / total;
      existing.b = (existing.b * existing.count + candidate.b * candidate.count) / total;
      existing.count = total;
    } else clusters.push({ ...candidate });
  }
  return clusters.sort((a, b) => b.count - a.count).slice(0, 8).map((color) => `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`);
}
