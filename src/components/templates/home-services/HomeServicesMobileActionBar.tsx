"use client";

import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import { getHomeServicesReadable } from "./home-services-theme";

export interface HomeServicesMobileActionBarProps {
  phoneHref: string | null;
  messageHref: string | null;
  estimateHref: string;
  showEstimate: boolean;
  colors: ThemeColors;
}

export function HomeServicesMobileActionBar({
  phoneHref,
  messageHref,
  estimateHref,
  showEstimate,
  colors,
}: HomeServicesMobileActionBarProps) {
  const t = useTranslations("homeServices");
  const readable = getHomeServicesReadable(colors);
  const controlTextColor = readable.navControl;
  const estimateTextColor = readable.ctaOnSecondary;

  const actions = [
    ...(phoneHref
      ? [{ key: "call", href: phoneHref, label: t("actions.call"), primary: false }]
      : []),
    ...(messageHref
      ? [{ key: "message", href: messageHref, label: t("actions.message"), primary: false }]
      : []),
    ...(showEstimate
      ? [{ key: "estimate", href: estimateHref, label: t("actions.freeEstimate"), primary: true }]
      : []),
  ];

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{
        backgroundColor: `${colors.background}F2`,
        borderColor: `${colors.foreground}14`,
        backdropFilter: "blur(12px)",
      }}
      role="toolbar"
      aria-label="Quick actions"
    >
      <div className="mx-auto grid max-w-6xl gap-2 px-3 py-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map((action) => (
          <a
            key={action.key}
            href={action.href}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-center text-xs font-semibold sm:text-sm"
            style={
              action.primary
                ? { backgroundColor: colors.secondary, color: estimateTextColor }
                : {
                    border: `1px solid ${colors.foreground}20`,
                    color: controlTextColor,
                    backgroundColor: colors.background,
                  }
            }
          >
            {action.label}
          </a>
        ))}
      </div>
    </div>
  );
}
