# SiteForOwners SEO

Homepage metadata targets stylists, salons, braiders and barbers. Copy lives in `messages/en.json` under `marketing.seo`; Spanish copy is stored for future localization, but the current English-only marketing page does not advertise untranslated language variants.

The domain-specific sitemap lists `/`, `/demo`, `/request-site`, `/privacy` and `/terms`. It excludes private previews, dashboards and tenant sites. InviteSpot continues to advertise its own sitemap on its own domain.

Update `SITEFOROWNERS_CONTENT_UPDATED` in `src/lib/siteforowners-seo.ts` after meaningful homepage content changes. Other entries omit modification dates until accurate dates are tracked.

The static sharing image uses the existing locs marketing asset and brand colors. Regenerate it with `node --import tsx scripts/generate-siteforowners-social-image.tsx`. Inspect and commit the PNG alongside source/copy changes. The root Open Graph and Twitter image endpoints also serve this asset.

After deploying, verify both `https://www.siteforowners.com/robots.txt` and `https://www.siteforowners.com/sitemap.xml`. In Google Search Console, add/verify the `siteforowners.com` domain property, submit the sitemap, run URL Inspection for the homepage and request indexing. Sitemap success confirms processing; use the Pages report to check actual indexing.
