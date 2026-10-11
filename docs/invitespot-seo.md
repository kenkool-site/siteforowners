# InviteSpot SEO maintenance

The homepage uses `src/lib/invitespot-seo.ts` for localized metadata. Copy lives in the `invitespot.seo` namespace in `messages/en.json` and `messages/es.json`.

## Language URLs

- English: `https://www.invitespot.app/`
- Spanish: `https://www.invitespot.app/?lang=es`

Each language has its own canonical URL. Both include reciprocal English, Spanish and `x-default` alternates. Referral parameters are excluded from canonical and social URLs. The sitemap lists both versions and the same language alternates.

## Content updates

After a meaningful marketing-content change:

1. Update `INVITESPOT_CONTENT_UPDATED` in `src/lib/invitespot-seo.ts` to the actual change date.
2. If sharing-image copy or photos change, run `node --import tsx scripts/generate-invitespot-social-images.tsx` from the project root.
3. Inspect both generated PNGs. Commit the images alongside the source/copy changes.

Social previews are static 1200×630 PNG assets, so crawlers need no database, auth or dynamic rendering. They use the existing real demo photographs; provenance is recorded in `public/invitespot/photos/PROVENANCE.md`.

## After deployment

Check the homepage HTML for both languages, `robots.txt`, `sitemap.xml`, and the two `social-preview-*.png` files. The Spanish page must have Spanish title/description and its own canonical. Sharing URLs must point to invitespot.app, not siteforowners.com.

The site owner should add the `invitespot.app` domain property in Google Search Console, verify ownership with the DNS TXT record provided by Google, then submit `https://www.invitespot.app/sitemap.xml`. Use URL Inspection for the English and Spanish homepages. Search Console ownership and indexing are account-side steps, not automatic outcomes of this code change.
