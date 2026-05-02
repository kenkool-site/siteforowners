"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

interface NavItem {
  id: string;
  label: string;
}

interface SiteNavProps {
  items: NavItem[];
  colors: ThemeColors;
  locale?: "en" | "es";
  onLocaleChange?: (locale: "en" | "es") => void;
}

export function SiteNav({ items, colors, locale = "en", onLocaleChange }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const controlTextColor = ensureReadable(colors.foreground, colors.background);
  const drawerTextColor = ensureReadable(colors.background, colors.foreground);
  const selectedLocaleTextColor = ensureReadable(colors.background, colors.primary, 3);
  const accentColor = colors.primary;
  const shellBackground = `${colors.background}E6`;
  const shellBorder = `${colors.foreground}1A`;

  const scrollTo = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-4 py-4 sm:px-6">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_18px_45px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform hover:scale-105"
          style={{ backgroundColor: shellBackground, borderColor: shellBorder, color: controlTextColor }}
          aria-label="Navigation menu"
        >
          <AnimatePresence mode="wait">
            {open ? (
              <motion.svg
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </motion.svg>
            ) : (
              <motion.svg
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </motion.svg>
            )}
          </AnimatePresence>
        </button>

        {onLocaleChange && (
          <div
            className="flex overflow-hidden rounded-full border p-1 shadow-[0_18px_45px_rgba(0,0,0,0.14)] backdrop-blur-xl"
            style={{ backgroundColor: shellBackground, borderColor: shellBorder }}
          >
            <button
              onClick={() => onLocaleChange("en")}
              className="rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-all"
              style={{
                backgroundColor: locale === "en" ? colors.primary : "transparent",
                color: locale === "en" ? selectedLocaleTextColor : controlTextColor,
              }}
            >
              EN
            </button>
            <button
              onClick={() => onLocaleChange("es")}
              className="rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-all"
              style={{
                backgroundColor: locale === "es" ? colors.primary : "transparent",
                color: locale === "es" ? selectedLocaleTextColor : controlTextColor,
              }}
            >
              ES
            </button>
          </div>
        )}
      </div>

      {/* Nav overlay — slides from LEFT */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.nav
              initial={{ x: -28, opacity: 0, scale: 0.98 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -28, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute left-3 top-3 h-[calc(100%-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.25rem] border shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl"
              style={{ backgroundColor: `${colors.foreground}F2`, borderColor: `${drawerTextColor}1A` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-full flex-col px-5 pb-5 pt-16">
                <div className="mb-5 h-px w-12" style={{ backgroundColor: accentColor }} />
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <button
                        onClick={() => scrollTo(item.id)}
                            className="w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold tracking-wide transition-all hover:bg-white/10"
                        style={{ color: drawerTextColor }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = drawerTextColor)}
                      >
                        {item.label}
                      </button>
                    </motion.li>
                  ))}
                </ul>

                <div className="mt-auto rounded-2xl border p-2" style={{ borderColor: drawerTextColor + "18" }}>
                  <a
                    href="/admin"
                    className="block rounded-xl px-4 py-3 text-left text-xs font-medium opacity-70 transition-all hover:bg-white/10 hover:opacity-100"
                    style={{ color: drawerTextColor }}
                  >
                    Owner login →
                  </a>
                </div>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
