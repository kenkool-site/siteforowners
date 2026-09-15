import sharp from "sharp";

type Cluster = { r: number; g: number; b: number; count: number };
const quantize = (value: number) => Math.min(240, Math.round(value / 16) * 16);
const distance = (a: Cluster, b: Cluster) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0").toUpperCase();
const toHex = ({ r, g, b }: Omit<Cluster, "count">) => `#${hex(r)}${hex(g)}${hex(b)}`;
const parseHex = (value: string) => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) });
const lightness = (color: Omit<Cluster, "count">) => (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 510;
const saturation = (color: Omit<Cluster, "count">) => {
  const high = Math.max(color.r, color.g, color.b), low = Math.min(color.r, color.g, color.b);
  return high === 0 ? 0 : (high - low) / high;
};
const mix = (a: Omit<Cluster, "count">, b: Omit<Cluster, "count">, amount: number) => ({ r: a.r * (1 - amount) + b.r * amount, g: a.g * (1 - amount) + b.g * amount, b: a.b * (1 - amount) + b.b * amount });

export function assignInvitationPalette(colors: string[]): {
  background: string; surface: string; text: string; mutedText: string; accent: string; overlay: string; heroText: string;
} {
  const parsed = colors.filter((value) => /^#[0-9a-f]{6}$/i.test(value)).map((value) => ({ value: value.toUpperCase(), color: parseHex(value) }));
  if (!parsed.length) return { background: "#F7F5EF", surface: "#FCFBF7", text: "#172238", mutedText: "#59616E", accent: "#B58A55", overlay: "#172238", heroText: "#FFFFFF" };
  const background = [...parsed].sort((a, b) => (lightness(b.color) - saturation(b.color) * 0.25) - (lightness(a.color) - saturation(a.color) * 0.25))[0]!;
  const remaining = parsed.filter((item) => item !== background);
  const darkest = [...remaining].sort((a, b) => lightness(a.color) - lightness(b.color))[0] ?? background;
  const textColor = lightness(darkest.color) <= 0.36 ? darkest.color : mix(darkest.color, { r: 0, g: 0, b: 0 }, 0.62);
  const accent = [...remaining].filter((item) => item !== darkest).sort((a, b) => saturation(b.color) - saturation(a.color))[0] ?? darkest;
  return {
    background: background.value,
    surface: toHex(mix(background.color, { r: 255, g: 255, b: 255 }, 0.55)),
    text: toHex(textColor),
    mutedText: toHex(mix(textColor, background.color, 0.28)),
    accent: accent.value,
    overlay: toHex(textColor),
    heroText: "#FFFFFF",
  };
}

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
  const minimum = data.length / 3 * 0.001;
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
  const coverage = clusters.sort((a, b) => b.count - a.count);
  const vivid = [...coverage].sort((a, b) => saturation(b) - saturation(a));
  return Array.from(new Set([...coverage.slice(0, 5), ...vivid.slice(0, 3)].map(toHex))).slice(0, 8);
}
