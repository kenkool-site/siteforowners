import type { SocialLinks } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

type Variant = "hero" | "footer";

interface TemplateSocialLinksProps {
  links?: SocialLinks | null;
  colors: ThemeColors;
  variant?: Variant;
}

const ICONS = {
  instagram: {
    label: "Instagram",
    path: "M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2Zm0 2A3.75 3.75 0 0 0 4 7.75v8.5A3.75 3.75 0 0 0 7.75 20h8.5A3.75 3.75 0 0 0 20 16.25v-8.5A3.75 3.75 0 0 0 16.25 4h-8.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-2.4a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z",
  },
  facebook: {
    label: "Facebook",
    path: "M14 8.5V6.75c0-.7.36-1.05 1.12-1.05H17V2.2A25.4 25.4 0 0 0 14.26 2C11.55 2 9.7 3.65 9.7 6.63V8.5H6.62v3.9H9.7V22h4.05v-9.6h3.08l.58-3.9H14Z",
  },
  tiktok: {
    label: "TikTok",
    path: "M15.4 2c.35 3.03 2.05 4.84 4.98 5.03v3.4a8.34 8.34 0 0 1-4.9-1.56v6.42c0 4.36-4.71 7.12-8.52 4.95-3.87-2.21-3.7-7.8.28-9.78a8.2 8.2 0 0 1 3.4-.68v3.58c-.43-.06-.88-.01-1.31.15-1.75.65-2.28 2.87-.95 4.14 1.3 1.25 3.55.55 3.55-1.52V2h3.47Z",
  },
} as const;

export function TemplateSocialLinks({ links, colors, variant = "hero" }: TemplateSocialLinksProps) {
  const items = [
    { key: "instagram" as const, href: links?.instagram },
    { key: "facebook" as const, href: links?.facebook },
    { key: "tiktok" as const, href: links?.tiktok },
  ].filter((item) => item.href);

  if (items.length === 0) return null;

  const isFooter = variant === "footer";
  const color = ensureReadable(isFooter ? colors.background : colors.foreground, isFooter ? colors.foreground : colors.background, 3);
  const borderColor = `${color}30`;
  const backgroundColor = isFooter ? `${colors.background}12` : `${colors.background}E6`;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Social links">
      {items.map((item) => {
        const icon = ICONS[item.key];
        return (
          <a
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={icon.label}
            title={icon.label}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
            style={{ color, borderColor, backgroundColor }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={icon.path} />
            </svg>
          </a>
        );
      })}
    </div>
  );
}
