"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { getHomeServicesReadable } from "./home-services-theme";

export interface HomeServicesNavProps {
  businessName: string;
  locale: HomeServicesLocale;
  showGallery: boolean;
  showReviews: boolean;
  estimateHref: string;
  colors: ThemeColors;
  onLocaleChange?: (locale: HomeServicesLocale) => void;
}

export function HomeServicesNav({
  businessName,
  locale,
  showGallery,
  showReviews,
  estimateHref,
  colors,
  onLocaleChange,
}: HomeServicesNavProps) {
  const t = useTranslations("homeServices");
  const [open, setOpen] = useState(false);
  const languageHref = locale === "es" ? "/" : "/es";
  const languageLabel = locale === "es" ? "EN" : "ES";
  const nextLocale: HomeServicesLocale = locale === "es" ? "en" : "es";
  const readable = getHomeServicesReadable(colors);
  const controlTextColor = readable.navControl;
  const drawerTextColor = readable.drawerBody;
  const estimateTextColor = readable.ctaOnSecondary;
  const shellBackground = `${colors.background}E6`;
  const shellBorder = `${colors.foreground}1A`;

  const navLinks = [
    { id: "services", label: t("nav.services"), href: "#services" },
    ...(showGallery ? [{ id: "work", label: t("nav.work"), href: "#work" }] : []),
    ...(showReviews ? [{ id: "reviews", label: t("nav.reviews"), href: "#reviews" }] : []),
  ];

  const closeMenu = () => setOpen(false);

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b backdrop-blur-xl"
        style={{ backgroundColor: shellBackground, borderColor: shellBorder }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a
            href="#home"
            className="min-h-11 min-w-0 truncate text-sm font-bold tracking-tight sm:text-base"
            style={{ color: colors.primary }}
          >
            {businessName}
          </a>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navLinks.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="min-h-11 rounded-full px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: controlTextColor }}
              >
                {item.label}
              </a>
            ))}
            {onLocaleChange ? (
              <button
                type="button"
                onClick={() => onLocaleChange(nextLocale)}
                className="min-h-11 rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-80"
                style={{ color: controlTextColor }}
              >
                {languageLabel}
              </button>
            ) : <Link
              href={languageHref}
              className="min-h-11 rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-80"
              style={{ color: controlTextColor }}
            >
              {languageLabel}
            </Link>}
            <a
              href={estimateHref}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
            >
              {t("actions.freeEstimate")}
            </a>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            {onLocaleChange ? (
              <button
                type="button"
                onClick={() => onLocaleChange(nextLocale)}
                className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-bold uppercase tracking-[0.14em]"
                style={{ borderColor: shellBorder, color: controlTextColor, backgroundColor: colors.background }}
              >
                {languageLabel}
              </button>
            ) : <Link
              href={languageHref}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-bold uppercase tracking-[0.14em]"
              style={{ borderColor: shellBorder, color: controlTextColor, backgroundColor: colors.background }}
            >
              {languageLabel}
            </Link>}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
              style={{ borderColor: shellBorder, color: controlTextColor, backgroundColor: colors.background }}
              aria-label="Navigation menu"
              aria-expanded={open}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm md:hidden"
            onClick={closeMenu}
          >
            <motion.nav
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="absolute right-0 top-0 flex h-full w-[min(88vw,20rem)] flex-col gap-2 border-l px-5 pb-8 pt-24 shadow-2xl"
              style={{ backgroundColor: colors.background, borderColor: shellBorder, color: drawerTextColor }}
              aria-label="Mobile"
              onClick={(event) => event.stopPropagation()}
            >
              {navLinks.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={closeMenu}
                  className="min-h-11 rounded-xl px-3 py-3 text-base font-medium"
                >
                  {item.label}
                </a>
              ))}
              <a
                href={estimateHref}
                onClick={closeMenu}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-semibold"
                style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
              >
                {t("actions.freeEstimate")}
              </a>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
