# InviteSpot — Event Schedule Design

**Status:** Approved for planning (brainstorming complete 2026-09-26)

## Summary

Today, a host who wants to show guests a day-of schedule ("Wedding Ceremony @ 1pm, Cocktail @ 2:30pm, Wedding Reception @ 3:30pm") has to type it as free-text prose into the generic "Additional Sections" feature — the system has no idea any of those lines are times or names, it's just a heading and a paragraph. This spec replaces that use case with a real, structured Event Schedule: a list of named programs, each with a time and an optional venue (name + address), that both renders as its own guest-facing card and can seed the existing Moments feature's time-range grouping — removing the need to type the same times twice.

## Background

Two existing features are relevant and stay independent of each other, unchanged:

- **Additional Sections** (`invitation_events.additional_sections`, a JSONB array of `{heading, content}`, see `src/lib/invitations/additional-sections.ts`) — arbitrary host-authored free text (dress code, parking notes, anything). It keeps working exactly as it does today; a host can still use it for things that aren't a schedule.
- **Moments** (`memory_moments` table, `src/components/invitations/memories/OwnerMomentsManager.tsx`) — host-defined time windows (name + `startsAt` + `endsAt`) that the Memories gallery groups guest photos into. Fully manual today: the host types every field from scratch, with no relationship to anything else in the app.

Event Schedule sits between them: structured like Moments (name + time), but it's core invitation content (like the venue or date), not a Memories feature — so it lives in the main Event Editor, not the Memories management area.

## Data model

One additive JSONB column, no new table — matching this codebase's existing convention for a small, host-ordered, purely-display list (see `additional_sections` above), rather than a relational child table like Moments needs (Moments needs joins for gallery filtering; Schedule doesn't need any independent querying beyond "this event's list").

`invitation_events.event_schedule jsonb not null default '[]'` — an array of:

```ts
type EventScheduleItem = {
  name: string;           // "Wedding Ceremony"
  startsAt: string;       // ISO timestamp — event's existing date + a host-entered time-of-day, combined server-side using the event's existing timezone field
  locationName?: string;  // "St. Mary's Catholic Church" — optional
  locationAddress?: string; // "123 Chapel St, Brooklyn, NY" — optional
};
```

Items are always rendered and edited in `startsAt` order — no separate sort field needed, since a schedule is inherently chronological. `locationName`/`locationAddress` are independent optional fields: a host can set either, both, or neither per item (e.g. Cocktail Hour commonly has no location at all when it's at the same venue as whatever follows).

Single-date only, for now: every item uses the event's one existing start date, varying only in time-of-day. No per-item date — this app has no multi-day-event concept anywhere today, and adding one is out of scope here.

## Guest-facing display

A new card, separate from Additional Sections, rendered on the public invitation page (`PublicInvitation.tsx`) wherever Additional Sections currently render, following the same `theme`/`recipe.palette` theming this page already uses for every other section (serif heading font, the event's actual accent/background/surface colors — never hardcoded colors).

Vertical timeline layout (validated via mockup against the real "Mercy & John" event, using its actual photos and a green-on-cream palette matching the example the host originally shared): a connecting line down the left with a dot per item, time-of-day and name side by side, and — only when set — a small pin-icon line underneath showing `locationName` and `locationAddress` together. An item with neither location field set shows no location line at all; nothing renders empty or with placeholder text.

Only rendered at all when the event has at least one schedule item — an event with none shows nothing, the same way Additional Sections already behaves when empty.

## Host editor

A new section in the Event Editor (`EventEditor.tsx`), alongside where Additional Sections is managed today. Same add/edit/delete interaction pattern already established by `OwnerMomentsManager.tsx`: per item, a name field, a time field, and two optional fields (location name, address) that simply don't render on the guest view when left blank. Reordering isn't a separate control — items are always shown and edited sorted by their own time.

## Moments integration

No schema link between `memory_moments` and `event_schedule` at all, by design: a schedule item seeds a Moment once, and from that point on the Moment is an ordinary, independently-editable row — exactly as if the host had typed it into Moments directly. Editing the schedule afterward never reaches back and changes an already-created Moment; this was an explicit design decision (an "always synced" alternative was considered and rejected, since it risks silently overwriting a host's manual adjustment to a Moment's time range after the real day ran differently from the plan).

Inside the existing Moments manager (`OwnerMomentsManager.tsx`), a new "Create Moments from your Event Schedule" action — visible whenever the event has at least one schedule item — lists each schedule item with its inferred range and a checkbox, then bulk-creates real `memory_moments` rows (via the existing `createMemoryMoment` repository call, unchanged) for whichever the host checks:

- A schedule item's inferred end time is the next item's `startsAt`.
- The last (or only) schedule item's inferred end time is its own `startsAt` + 2 hours — a reasonable single-segment default, and, like every other Moment, editable by the host afterward if it's wrong.

Schedule items already used to create a Moment stay selectable again (no "already used" hiding) — a host might reasonably want two Moments covering the same schedule item's timeframe (e.g. a wide "Ceremony" Moment and a narrower "First Kiss" one).

## Non-goals

- No migration of existing free-text "schedule-shaped" Additional Sections content into the new structured format — a host who wants the new card re-enters it structuredly; parsing arbitrary prose back into structured data isn't attempted.
- No multi-day event support (see Data model above).
- No live/ongoing sync between a schedule item and any Moment it seeded.
- No reordering control in the editor beyond time-of-day (see Host editor above).
- No changes to Additional Sections' own behavior, storage, or rendering.

## Testing

- `EventScheduleItem` parsing/validation follows the exact structure and testing treatment `parseInvitationAdditionalSections` already gets in `src/lib/invitations/additional-sections.ts` (a pure function, directly unit-tested, no live database needed).
- The "inferred end time" computation (next item's start, or +2h for the last one) is pure and independently unit-testable given a plain array of `{name, startsAt}`, with no dependency on the database or the guest-facing rendering.
- Guest-facing rendering (the timeline card, the optional location line's presence/absence) is tested the same way this codebase already tests conditional rendering elsewhere in `PublicInvitation.tsx` — mount with and without location fields set, assert what does and doesn't appear.
- The Moments-manager bulk-create action is tested like every other write path in `OwnerMomentsManager.tsx`'s existing test file: mock the fetch call, assert the right `createMemoryMoment`-shaped payloads go out for the checked items, and that creating from a schedule item never mutates the schedule itself.
