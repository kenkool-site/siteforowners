# Product Theater Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw customer/hero screenshot dependencies with premium rendered product visuals for the marketing homepage.

**Architecture:** Keep the existing marketing section structure. Update `HeroShowcase` and `CustomerView` to render product/site mockups from structured data and Tailwind/Framer Motion instead of `next/image` references to `public/marketing/customer-view` or `public/marketing/hero`. Add a small regression test that fails if those raw public asset paths return.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Framer Motion, Node `node:test`.

---

## File Map

- Modify: `src/app/(marketing)/_components/HeroShowcase.tsx`
- Modify: `src/app/(marketing)/_components/CustomerView.tsx`
- Modify: `.gitignore`
- Modify: `public/marketing/README.md`
- Modify: `docs/superpowers/specs/2026-05-01-marketing-page-redesign-design.md`
- Create: `tests/marketing-rendered-assets.test.mjs`
- Local only: `.design-references/customer-view/*.png`

## Tasks

- [ ] Move reference screenshots from `public/marketing/customer-view/` to `.design-references/customer-view/` and ignore that folder.
- [ ] Add a regression test that scans marketing components and fails when `/marketing/customer-view/` or `/marketing/hero/` paths are referenced.
- [ ] Rewrite `HeroShowcase` as a layered Product Theater visual with rendered mobile/desktop cards and motion.
- [ ] Rewrite `CustomerView` as rendered vertical previews and a booking-flow strip, inspired by the reference screenshots but not using them.
- [ ] Run the regression test, TypeScript, lints, and inspect edited files for diagnostics.

## Notes

- Do not commit from this session unless the user explicitly asks.
- Dashboard screenshots may remain in `public/marketing/dashboard/` for now; this plan only removes the customer/hero raw image dependency.
