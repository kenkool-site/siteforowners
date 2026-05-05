# Admin Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the real owner admin shell and dashboard home into the approved Premium Owner Command Center.

**Architecture:** Keep all existing data loading, routes, auth, and admin behavior unchanged. Update only presentational components for the admin chrome and home dashboard: `AdminShell`, `LeadsBadge`, `StatCard`, `VisitorsStrip`, `Sparkline`, `RecentActivity`, and `site/[slug]/admin/page.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS.

---

## Tasks

### Task 1: Admin Chrome

**Files:**
- Modify `src/app/site/[slug]/admin/_components/AdminShell.tsx`
- Modify `src/app/site/[slug]/admin/_components/LeadsBadge.tsx`

Steps:

- [ ] Replace emoji tab icons with short text glyphs.
- [ ] Redesign desktop sidebar as a wider warm navigation rail.
- [ ] Redesign mobile top bar and bottom nav while preserving all links/actions.
- [ ] Keep `View site`, `LeadsBadge`, and `SignOutButton` behavior unchanged.

### Task 2: Dashboard Home

**Files:**
- Modify `src/app/site/[slug]/admin/page.tsx`
- Modify `src/app/site/[slug]/admin/_components/StatCard.tsx`

Steps:

- [ ] Add premium greeting/hero panel with existing `Greeting`.
- [ ] Preserve existing stat card data and hrefs.
- [ ] Redesign stat cards with larger hierarchy and warm surfaces.

### Task 3: Insights And Activity

**Files:**
- Modify `src/app/site/[slug]/admin/_components/VisitorsStrip.tsx`
- Modify `src/app/site/[slug]/admin/_components/Sparkline.tsx`
- Modify `src/app/site/[slug]/admin/_components/RecentActivity.tsx`

Steps:

- [ ] Redesign visitor analytics as a premium insight card.
- [ ] Keep current `VisitStats` and `Sparkline` data.
- [ ] Redesign recent activity rows as a polished feed and improve empty state.

### Task 4: Verification

Steps:

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Fix any introduced errors in touched files.
