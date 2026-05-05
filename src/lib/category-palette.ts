/**
 * Deterministic accent colors per category name (admin Services UI).
 * Full Tailwind class strings — `./src/lib/**` must be listed in `tailwind.config` `content`
 * so JIT emits these utilities (palette is not inlined in JSX).
 */
export const CATEGORY_PALETTE = [
  { shell: "border-rose-200 bg-rose-50", name: "text-rose-950", count: "text-rose-800/80", accentBar: "border-l-rose-500" },
  { shell: "border-orange-200 bg-orange-50", name: "text-orange-950", count: "text-orange-900/75", accentBar: "border-l-orange-500" },
  { shell: "border-amber-200 bg-amber-50", name: "text-amber-950", count: "text-amber-900/75", accentBar: "border-l-amber-500" },
  { shell: "border-lime-200 bg-lime-50", name: "text-lime-950", count: "text-lime-900/75", accentBar: "border-l-lime-600" },
  { shell: "border-emerald-200 bg-emerald-50", name: "text-emerald-950", count: "text-emerald-900/75", accentBar: "border-l-emerald-500" },
  { shell: "border-cyan-200 bg-cyan-50", name: "text-cyan-950", count: "text-cyan-900/75", accentBar: "border-l-cyan-500" },
  { shell: "border-sky-200 bg-sky-50", name: "text-sky-950", count: "text-sky-900/75", accentBar: "border-l-sky-500" },
  { shell: "border-violet-200 bg-violet-50", name: "text-violet-950", count: "text-violet-900/75", accentBar: "border-l-violet-500" },
  { shell: "border-fuchsia-200 bg-fuchsia-50", name: "text-fuchsia-950", count: "text-fuchsia-900/75", accentBar: "border-l-fuchsia-500" },
  { shell: "border-indigo-200 bg-indigo-50", name: "text-indigo-950", count: "text-indigo-900/75", accentBar: "border-l-indigo-500" },
] as const;

export function categoryPaletteIndex(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i++) {
    h = (Math.imul(31, h) + category.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % CATEGORY_PALETTE.length;
}

export function getCategoryPalette(category: string | undefined | null) {
  const key = (category ?? "").trim();
  if (!key) {
    return {
      shell: "border-warm-cream1 bg-warm-cream2",
      name: "text-warm-deep",
      count: "text-warm-textMuted",
      tag: "border-warm-cream1 bg-warm-cream2 text-warm-deep ring-1 ring-warm-cream1",
      accentBar: "border-l-transparent",
    };
  }
  const p = CATEGORY_PALETTE[categoryPaletteIndex(key)];
  return {
    shell: p.shell,
    name: p.name,
    count: p.count,
    tag: `${p.shell} ${p.name} ring-1 ring-black/5`,
    accentBar: p.accentBar,
  };
}
