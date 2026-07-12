# Richer home-services homepage

**Date:** 2026-07-12  
**Branch:** `feat/home-services-template-foundation`  
**Status:** Approved design

## Problem

The home-services homepage has the essential conversion sections, but it is too
sparse to fully explain the business, its process, recent work, and local
coverage. Service coverage is currently stored and rendered as one bilingual
sentence. Contractors commonly serve five or more cities and ZIP codes, and
customers need to scan those locations directly rather than infer coverage from
a map or generic “nearby areas” statement.

## Goal

Create a richer, configurable bilingual homepage that builds confidence in a
clear conversion story, adds an editable three-step process, and presents
structured city/ZIP service coverage as a readable list. Preserve existing
sites, the estimate modal and delivery flow, stylist templates, and the future
dedicated service-area SEO architecture.

## Approved visual direction

The approved direction is “Conversion Story,” informed by the supplied outdoor-
services reference without copying its dense layout or visual styling. It keeps
the existing Neighborhood Professional navy/green theme, generous spacing,
clear cards, and mobile-first hierarchy.

Homepage order:

1. Navigation.
2. Richer hero with free estimate, call/text, and a concise local-coverage
   signal.
3. Trust strip.
4. Services with an editable heading and introduction.
5. Recent work with an editable heading/introduction and optional city captions.
6. Editable bilingual three-step “How it works.”
7. Existing conditional “Why Us” (retained for backward compatibility).
8. Reviews and service areas side-by-side on desktop and stacked on mobile.
9. Final call/text/free-estimate CTA.
10. Footer and mobile action bar.

Maps remain optional and secondary. The city/ZIP list is the authoritative
public coverage presentation.

## Content model

Extend `generated_copy.home_services_config` with validated presentation data.
No database migration is required for this phase.

### Section copy

Each richer section can override its default English and Spanish label, title,
and introduction:

- services;
- recent work;
- how it works;
- reviews;
- service areas; and
- final estimate CTA.

Missing or invalid overrides fall back to polished bilingual defaults. Existing
tenant copy is never replaced during parsing.

### Process steps

`process_steps` contains up to three ordered entries:

- stable ID;
- English title and description; and
- Spanish title and description.

New home-services previews seed these defaults:

1. Tell us what you need / Cuéntenos qué necesita.
2. Get your estimate / Reciba su estimado.
3. Schedule the work / Programe el trabajo.

All step titles and descriptions are founder-editable. Empty or incomplete rows
are rejected by the parser. If no valid configured steps exist, the public page
uses the default three steps rather than rendering an empty section. The section
can still be disabled explicitly through its section visibility setting.

### Structured service areas

`service_areas` contains ordered entries with:

- stable ID;
- city or area name;
- zero or more ZIP codes;
- optional English note; and
- optional Spanish note.

City/area names and ZIP codes are shared between languages. Only descriptive
notes are localized. Limits:

- maximum 20 service-area entries;
- maximum 10 ZIP codes per entry;
- United States ZIP format: five digits or ZIP+4;
- no duplicate city/area names after case-insensitive trimming; and
- no duplicate ZIP code anywhere in the configured list.

The editor reports validation errors instead of silently discarding founder
input. The public parser remains defensive and keeps only valid normalized data.

### Backward compatibility

`coverage_summary_en` and `coverage_summary_es` remain supported.

- Structured entries present: render the city/ZIP list and use the summary as an
  optional introduction.
- No structured entries: render the existing localized summary exactly as the
  current site does.
- Neither present: hide the service-area section.

Existing sites therefore continue rendering without an editor save or data
migration.

## Public components

### Richer hero

Keep the existing hero image, headline, subheadline, and actions. When structured
service areas exist, show a compact local-coverage signal such as “Serving 5
local areas” with the first two or three names. Do not crowd the hero with the
full list or private origin address.

### Services and recent work

Add localized eyebrow/title/introduction support while preserving the existing
service cards, project data, and estimate preselection. Recent-work captions may
include the existing project `area_slug` or configured caption; this phase does
not invent locations for projects.

### How it works

Create a focused `HomeServicesProcess` component. It renders up to three ordered
steps with restrained numbered/icon treatment, localized title/body, and no
interaction. It uses one column on narrow mobile and three columns on desktop.

### Reviews and service areas

Create a desktop two-column composition when both sections exist. When only one
exists, it receives the full content width. On mobile, reviews render first and
service areas second.

The service-area list uses compact accessible list items. Each item shows city or
area name, ZIP codes when present, and its locale-specific note when present.
It is readable without a map and does not rely on color alone for its check/icon
state.

### Final CTA

Replace the plain estimate card with a richer action band containing localized
heading/body plus Call, Message, and Free Estimate actions when configured. The
estimate action opens the already-approved shared modal. No duplicate form is
added.

## Founder editor

Extend `HomeServicesSiteEditor` with three focused groups:

1. Section headings and introductions, with paired English/Spanish fields.
2. Process steps, supporting add, remove, edit, and reorder up to three rows.
3. Service areas, supporting add, remove, edit, and reorder up to 20 rows, with a
   simple ZIP input that normalizes comma/newline-separated values.

The editor validates before save and shows row-specific errors for missing area
names, malformed ZIPs, duplicate areas, duplicate ZIPs, incomplete process rows,
and limit violations. It preserves unrelated home-services configuration and
uses the existing `/api/update-site` persistence path.

Section visibility controls add `show_process`; current visibility controls
remain unchanged.

## Presets and generation

The outdoor-services preset and new wizard-created home-services previews include
the default process and richer default section copy. They do not invent cities,
ZIP codes, ratings, licenses, insurance, review counts, or years in business.

Wizard address parsing may continue producing the safe coverage summary, but it
must not infer multiple service areas or ZIP lists from a single business address.
Structured service areas are founder-entered.

## Future service-area SEO integration

This homepage structure is presentation configuration, not the final SEO record
source. The approved service-area SEO phase will use tenant-scoped database rows
for independently publishable city pages. That phase may import or synchronize
these structured homepage entries, but it must not create indexable pages from
city/ZIP names alone. Useful localized body copy and metadata remain required.

## Error handling and conditional rendering

- Missing localized section override: use localized default.
- No gallery projects: hide recent work, as today.
- No reviews: service areas use full width.
- No service areas: reviews use full width.
- Invalid public config data: normalize valid rows and fall back safely.
- Editor validation error: block save and retain all entered values.
- No phone/message action: omit that action without leaving an empty control.
- No structured areas but legacy summary: preserve summary-only rendering.

## Testing

Tests cover:

- default and validated section copy;
- process parsing, ordering, limits, bilingual completeness, and fallback;
- service-area name/ZIP normalization, ordering, limits, and deduplication;
- legacy summary compatibility;
- preset truthfulness and bilingual defaults;
- hero local-coverage signal without private address;
- process responsive contract;
- structured list semantics and mobile stacking;
- combined reviews/service-area desktop layout and single-section fallback;
- final CTA wiring to the shared estimate modal;
- founder editor add/remove/reorder and row-level validation;
- `/api/update-site` preservation of the extended config;
- existing estimate modal/delivery regressions;
- unchanged stylist template contracts;
- strict TypeScript and production build.

## Out of scope

- Dedicated indexable city pages or sitemap changes.
- Map generation, geocoding, radius calculations, or polygon coverage.
- Automatically inferring coverage from a private business address.
- Bulk AI-generated city content.
- Changing estimate persistence or delivery behavior.
- Changing stylist homepage layouts.
