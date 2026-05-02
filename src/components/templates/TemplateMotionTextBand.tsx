"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable, readableColors } from "@/lib/templates/contrast";

type MotionTemplate = "classic" | "bold" | "elegant" | "vibrant" | "warm";

interface TemplateMotionTextBandProps {
  items: string[];
  colors: ThemeColors;
  template: MotionTemplate;
  enabled?: boolean;
}

function getShortLabel(value: string): string {
  const clean = value
    .replace(/\([^)]*\)/g, "")
    .split(/[\/,&-]/)[0]
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > 22 ? `${clean.slice(0, 22).trim()}...` : clean;
}

export function TemplateMotionTextBand({
  items,
  colors,
  template,
  enabled = true,
}: TemplateMotionTextBandProps) {
  const labels = Array.from(new Set(items.map(getShortLabel).filter(Boolean))).slice(0, 8);
  if (labels.length === 0) return null;

  const rc = readableColors(colors);
  const isBold = template === "bold";
  const isElegant = template === "elegant";
  const isVibrant = template === "vibrant";
  const isWarm = template === "warm";

  const background = isBold
    ? colors.foreground
    : isVibrant
      ? colors.primary
      : isWarm
        ? colors.muted
        : colors.background;
  const textColor = isBold
    ? rc.primaryOnFg
    : isVibrant
      ? ensureReadable(colors.background, colors.primary)
      : isWarm
        ? rc.primaryOnMuted
        : rc.primaryOnBg;
  const borderColor = `${textColor}33`;
  const separator = isElegant ? "—" : isWarm ? "•" : "✦";

  return (
    <div
      className="overflow-hidden border-y py-3"
      style={{ backgroundColor: background, borderColor, color: textColor }}
    >
      <style>{`
        @keyframes template-motion-text {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className={`flex w-max items-center gap-6 whitespace-nowrap ${
          isElegant
            ? "font-serif text-sm italic tracking-[0.24em]"
            : "text-xs font-black uppercase tracking-[0.28em]"
        }`}
        style={enabled ? { animation: "template-motion-text 26s linear infinite" } : undefined}
        aria-hidden="true"
      >
        {[...labels, ...labels].map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-6">
            <span>{item}</span>
            <span className="opacity-45">{separator}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
