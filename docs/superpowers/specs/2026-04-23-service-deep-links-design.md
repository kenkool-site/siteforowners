# Service deep-links to booking provider — design

**Status:** implemented (Acuity only)
**Date:** 2026-04-23
**Scope:** v1 — clicking a service card in "Our Services" opens the specific appointment type on the tenant's Acuity scheduler.

## What shipped

- `TemplateOrchestrator` builds `serviceBookingUrls: Map<serviceName, url>` from `booking_categories` (populated during `/api/import-booking`).
- For each service in a category whose `directUrl` contains `acuityscheduling.com`, we take that `directUrl` and overwrite the `appointmentType` query param with the specific service's numeric `id`. No parsing of the subdomain, no reconstruction — just a `URL.searchParams.set()` call.
- `data.services` is enriched with an optional `bookingUrl?: string` by looking up the service name in the map.
- The five Services variants (`ClassicServices`, `BoldServices`, `ElegantServices`, `VibrantServices`, `WarmServices`) wrap their card `<div>` in `<a href={bookingUrl} target="_blank" rel="noopener noreferrer">` when the URL is set; otherwise render the existing non-clickable card unchanged.

## Matching

Case-sensitive exact match on `service.name` between `data.services[i]` and `booking_categories[j].services[k]`. Same convention as `service_descriptions`. If an admin renames a service in the editor but not in Acuity (or vice versa), the link silently falls through — the card stays non-clickable, not an error. The admin spots it the next time they view the site and re-syncs the names.

## Why the existing `directUrl` is safe to mutate

The stored value looks like `https://app.acuityscheduling.com/schedule.php?owner=123456&appointmentType=category:10.%20Loc%20Services`. Replacing `appointmentType=category:NAME` with `appointmentType=73540316` produces a valid per-appointment link that Acuity handles identically to the friendly `{subdomain}.as.me/schedule/{token}/appointment/{id}/calendar/{cal}` URL — both resolve to the same booking page. Using the query-param form avoids having to know the subdomain, the schedule token, or the calendar id.

## Extending to other providers (follow-up, not v1)

When the first non-Acuity client (Vagaro / Booksy / Square) needs service deep-links, generalize the Acuity-specific loop in `TemplateOrchestrator` into a provider-keyed URL builder. Rough shape:

```ts
type Provider = "acuity" | "vagaro" | "booksy" | "square";

function detectProvider(directUrl: string): Provider | null {
  if (directUrl.includes("acuityscheduling.com") || directUrl.includes(".as.me")) return "acuity";
  if (directUrl.includes("vagaro.com")) return "vagaro";
  if (directUrl.includes("booksy.com")) return "booksy";
  if (directUrl.includes("squareup.com") || directUrl.includes("square.site")) return "square";
  return null;
}

function buildServiceUrl(provider: Provider, directUrl: string, serviceId: number | string): string | null {
  switch (provider) {
    case "acuity": {
      const u = new URL(directUrl);
      u.searchParams.set("appointmentType", String(serviceId));
      return u.toString();
    }
    case "vagaro": {
      // TODO when first Vagaro client onboards. Vagaro deep links typically
      // use `?service={id}` or path-based `/book/service/{slug}`.
      return null;
    }
    case "booksy": {
      // TODO. Booksy uses `/en/{businessId}/service/{serviceId}` paths.
      return null;
    }
    case "square": {
      // TODO. Square uses appointment type slugs in the path.
      return null;
    }
  }
}
```

The import pipeline already stores `booking_categories` in a provider-agnostic shape (`{name, services:[{id,name,price,duration}], directUrl}`), so no schema change is needed — only the URL-rewrite logic grows. Each new provider is one case in the switch, driven by the actual URL patterns their scheduler uses. Don't build scaffolding speculatively; add each case when a real client needs it and we can observe their actual deep-link format.

**Files that would need changes at that point:** only `TemplateOrchestrator.tsx` (the URL-builder block). The Services variants and the import pipeline stay as-is.

## What we deliberately skipped

- **No "Book" button variant.** User picked full-card click-through; hover shadow is the only affordance.
- **No arrow icon.** Can be added later as a tiny glyph next to the service name if clients ask for it.
- **No shared Services type module.** Each variant duplicates the 1-line prop extension; that's cheaper than introducing a types barrel for 5 files that each have one consumer.
- **No URL shortening.** Acuity URLs go through `target="_blank"`; length doesn't matter in that context.
- **No analytics/click tracking.** Can be added later by wrapping the `<a>` in a handler that fires a Plausible event.

## Risks & edge cases

- **Malformed `directUrl`.** The `try { new URL(...) } catch {}` around `URL.searchParams.set` ensures a bad stored URL skips that service silently rather than crashing the site render.
- **Non-Acuity `directUrl` slipping past the check.** The `if (!cat.directUrl.includes("acuityscheduling.com")) continue;` gate is narrow but correct for v1 — Vagaro/Booksy/Square URLs will not match and those services stay non-clickable, which is the right behavior until the follow-up work above is done.
- **Service name drift.** Already covered — silent fall-through to non-clickable card.

## Testing

Manual smoke on letstrylocs after deploy:
1. Visit `letstrylocs.com`, scroll to "Our Services."
2. Hover a card (e.g. "Perm rods on locs") — cursor turns pointer, shadow lifts.
3. Click — opens Acuity in a new tab, lands directly on "Perm rods on locs" appointment type.
4. Confirm via `view-source:` that only the Acuity-matched services rendered as `<a>` tags; any manually-added services (if present) rendered as plain `<div>`.
5. Tenants not yet booking-imported: service cards should continue to render as plain `<div>` with no regression.
