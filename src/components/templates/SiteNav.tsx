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
}

export function SiteNav({ items, colors }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const textColor = ensureReadable(colors.background, colors.foreground);
  const accentColor = colors.primary;

  const scrollTo = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      {/* Hamburger button — fixed top-right */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-md transition-transform hover:scale-105"
        style={{ backgroundColor: `${colors.foreground}CC`, color: colors.background }}
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

      {/* Nav overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.nav
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-64 shadow-2xl"
              style={{ backgroundColor: colors.foreground }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-20">
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <button
                        onClick={() => scrollTo(item.id)}
                        className="w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-white/10"
                        style={{ color: textColor }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = textColor)}
                      >
                        {item.label}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
