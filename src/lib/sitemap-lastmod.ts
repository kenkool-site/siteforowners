import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

/**
 * Source files whose latest git commit is the sitemap lastmod for that URL.
 * A directory includes every file under it, so a copy edit moves the date
 * without a hand-maintained constant.
 */
export const SITEMAP_SOURCES: Record<string, readonly string[]> = {
  "/": [
    "src/app/(marketing)/page.tsx",
    "src/app/(marketing)/_components",
    "src/lib/siteforowners-seo.ts",
    "messages/en.json",
  ],
  "/demo": ["src/app/(marketing)/demo"],
  "/request-site": ["src/app/(marketing)/request-site"],
  "/privacy": ["src/app/(marketing)/privacy/page.tsx"],
  "/terms": ["src/app/(marketing)/terms/page.tsx"],
  "/website-for-hair-braiders": [
    "src/app/(marketing)/website-for-hair-braiders/page.tsx",
    "src/app/(marketing)/_components/NicheGuide.tsx",
  ],
  "/booking-website-for-braiders": [
    "src/app/(marketing)/booking-website-for-braiders/page.tsx",
    "src/app/(marketing)/_components/NicheGuide.tsx",
  ],
  "/hair-stylist-website-builder": [
    "src/app/(marketing)/hair-stylist-website-builder/page.tsx",
    "src/app/(marketing)/_components/NicheGuide.tsx",
  ],
};

/** Newest commit touching these paths, or newest file mtime when git is unavailable. */
export function lastModifiedIso(files: readonly string[]): string | undefined {
  const cwd = process.cwd();
  let latest = 0;
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", ...files],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) latest = ms;
  } catch {
    // Production serverless bundles do not include .git. next.config bakes
    // the dates at build time; this fallback covers local runs.
  }
  if (!latest) {
    for (const file of files) {
      try {
        const ms = statSync(join(cwd, file)).mtimeMs;
        if (ms > latest) latest = ms;
      } catch {
        // Missing path — skip.
      }
    }
  }
  return latest ? new Date(latest).toISOString() : undefined;
}

export function buildSitemapLastmodJson(): string {
  const map: Record<string, string> = {};
  for (const [path, files] of Object.entries(SITEMAP_SOURCES)) {
    const iso = lastModifiedIso(files);
    if (iso) map[path] = iso;
  }
  return JSON.stringify(map);
}
