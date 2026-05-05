# Admin Command Center Redesign

## Purpose

Redesign the real owner admin shell and dashboard home into a premium command center. This is not a marketing-only mockup. The updated UI should improve the daily owner experience and also create better product screenshots for `/demo`.

## Scope

First pass includes:

- `AdminShell`
- Admin home page header
- `StatCard`
- `VisitorsStrip`
- `RecentActivity`
- Supporting home layout spacing and section framing

Out of scope for this first pass:

- Schedule page internals
- Services editor internals
- Leads, updates, billing, and settings page internals
- Data model or API changes
- New admin features

## Design Direction

Use the **Premium Owner Command Center** direction.

The admin should feel warm, clean, and polished, but still practical for business owners who may be using it between appointments. The tone should be closer to a modern mobile banking or creator dashboard than a generic database admin.

Visual principles:

- Warm off-white page background instead of plain gray.
- Rounded white/cream cards with subtle borders.
- Strong but limited pink accent for active states, primary actions, and important numbers.
- Larger touch targets and clearer hierarchy.
- Real, simple text/icon treatments instead of emoji-heavy navigation.
- Mobile-first polish without weakening desktop usability.

## Shell Design

### Desktop

Desktop keeps a sidebar, but it should feel more like a product navigation rail:

- Width increases from the current narrow `w-48` to a more comfortable width.
- Business identity becomes a branded header card with business name, short label, and "View site" CTA.
- Navigation items use rounded pills with active background, label, and simple icon slot.
- Leads badge remains near the top because leads are high-value.
- Sign out moves to a low-emphasis footer area.
- Main content background shifts to warm cream.

### Mobile

Mobile keeps the top bar and bottom nav pattern because it is already thumb-friendly.

Updates:

- Top bar should feel calmer and less heavy than a full solid primary strip.
- Business name, view site, leads, and sign out remain accessible.
- Bottom nav keeps the primary four actions and overflow, but active state should be more obvious and polished.
- Touch target sizes stay at least as large as current implementation.

## Dashboard Home Design

The home page should answer: "What needs my attention today?"

Layout:

1. Hero/greeting panel
   - Greeting and business name.
   - Short "Today" subtitle.
   - Primary quick action: View site.
   - Secondary quick action: leads or schedule depending on available data.

2. Stat cards
   - Keep existing data: orders, bookings today, bookings next 7 days, unread leads.
   - Cards become more visual, with small labels, large numbers, and optional helper text.
   - Clickable cards should clearly feel tappable.

3. Visitor insight card
   - `VisitorsStrip` becomes a card with title, weekly count, trend, sparkline, and monthly total.
   - Preserve existing `VisitStats` data and `Sparkline` component.

4. Recent activity
   - Add a stronger section header.
   - Activity rows should feel like a feed: icon/status dot, title, subtitle, relative time.
   - Empty state should include a softer explanation and hint at what will appear there.

## Component Responsibilities

### `AdminShell`

Responsible for admin chrome only:

- Sidebar
- Mobile top bar
- Mobile bottom nav
- Main content wrapper

It should not know dashboard data beyond tenant identity and unread lead count.

### `StatCard`

Responsible for one metric card:

- Value
- Label
- Optional link behavior
- Optional full-width layout

No data fetching.

### `VisitorsStrip`

Responsible for visit analytics display:

- Weekly count
- Trend label
- Sparkline
- Monthly total

No data fetching.

### `RecentActivity`

Responsible for recent activity feed:

- Empty state
- Activity row styling
- Relative time display using existing helper

No data fetching.

### Admin Home Page

Responsible for data composition and section order only. It should keep the current server-side data fetching.

## Accessibility And Usability

- Preserve keyboard navigability for all nav links and cards.
- Active navigation states must not rely on color alone.
- Maintain readable contrast for pink accent on light backgrounds.
- Mobile bottom nav must preserve large touch targets.
- Avoid hiding existing routes or actions.
- Keep page structure understandable for screen readers with real headings and labels.

## Implementation Notes

- Prefer Tailwind-only changes and existing CSS variables where practical.
- Avoid adding a new UI library.
- Avoid changing routing, middleware, auth, or admin data fetching.
- Replace emoji icons with simple two-letter/text glyphs or lightweight local visual marks in the first pass; do not add an icon dependency for this redesign.
- Keep changes focused to shell/home components so schedule and services pages still work inside the new chrome.

## Acceptance Criteria

- `/admin` home looks clearly more premium and polished on desktop and mobile.
- Existing admin navigation routes still appear.
- Current home metrics still render.
- Visitors and recent activity still use existing data.
- Mobile bottom nav remains fixed and usable.
- No functional regressions to sign out, view site, leads badge, or navigation.
- Lint and build pass.
