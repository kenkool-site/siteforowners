import { execFileSync } from "node:child_process";

function readBakedSitemapLastmod() {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/print-sitemap-lastmod.ts"],
      { encoding: "utf8", cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    JSON.parse(stdout);
    return stdout;
  } catch (error) {
    console.warn("Sitemap lastmod was not baked from git. Entries will use runtime file dates.");
    console.warn(error instanceof Error ? error.message : error);
    return "";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Inlined at build so production sitemap lastmod does not depend on .git
    // inside the serverless function. Empty string falls through to git/mtime.
    SITEMAP_LASTMOD_JSON: readBakedSitemapLastmod(),
  },
  async redirects() {
    // Apex → www. Vercel’s domain setting currently answers first (it was a
    // 307 while redirectStatusCode was unset). This is the app-level 308 for
    // requests that reach Next, including local `next start`.
    const toWww = {
      has: [{ type: "host", value: "siteforowners.com" }],
      permanent: true,
    };
    return [
      { ...toWww, source: "/", destination: "https://www.siteforowners.com" },
      { ...toWww, source: "/:path*", destination: "https://www.siteforowners.com/:path*" },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
