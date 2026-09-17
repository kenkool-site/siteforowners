# Invitation Comment Wall Design

## Summary

Add an optional, text-only guestbook to each invitation. Guests who have the
invitation link can leave a named comment without signing in or completing an
RSVP. Comments publish immediately. Invitation owners, co-hosts, and founders
can hide, restore, or permanently delete them from the management portal.

The Comment Wall is disabled by default for existing and newly created
invitations. Enabling or disabling it is an invitation-level setting. Disabling
the wall hides both the form and all existing comments without deleting data.

This feature is separate from the RSVP "message for the host." RSVP messages
remain private and are never displayed in the Comment Wall.

## Goals

- Give guests a lightweight public guestbook near the end of an invitation.
- Let any person with the invitation link post without an account or RSVP.
- Give owners, co-hosts, and founders simple moderation controls.
- Preserve the invitation's dynamic palette and typography.
- Keep notification costs at zero by surfacing activity only in the portal.
- Protect the public submission endpoint against basic spam and accidental
  duplicate submissions.

## Non-goals

The first version will not include:

- Photo or file attachments
- Replies, threads, reactions, or likes
- Guest accounts or RSVP-linked identity
- Guest editing after submission
- Email or SMS notifications
- Profanity classification or approval-before-publish workflows
- A reusable social-feed framework

## Public invitation experience

### Placement

When enabled, the Comment Wall appears near the bottom of the public
invitation, after the event information and gallery and before the powered-by
footer. It must not displace or obscure the floating RSVP call to action.

The section contains:

- A heading such as "Guestbook" or the localized equivalent
- A short invitation to leave a note
- A "Leave a note" action
- Visible comments, newest first
- A "Show more" action when another page is available

The wall inherits the event's computed background, foreground, accent,
typography, borders, and frame language. Contrast must be calculated using the
same safe palette behavior as the rest of the public invitation; comment text
must not use a raw extracted color that fails contrast requirements.

### Comment form

"Leave a note" opens a compact modal or bottom sheet consistent with the RSVP
dialog. The form has only:

- Display name, required, 1-80 characters after trimming
- Comment, required, 1-1,000 characters after trimming
- An invisible honeypot field

The guest does not provide an email address or phone number. Posting does not
require a prior RSVP. The submit button shows an in-progress state and cannot
be submitted twice while the first request is pending.

After a successful submission, the form closes or switches to a success state
and the newly submitted comment appears at the top of the wall. If submission
fails, the typed values remain available and the form shows a clear retry
message.

### Availability

Reading and posting are allowed only while the public invitation itself is
available and the wall is enabled. Both `published` and `rsvp_closed` events
may accept comments because closing RSVPs does not close the invitation.

Draft, offline, and expired invitations do not expose comments or accept new
ones. If the owner disables the wall while a guest has the form open, the API
returns a stable closed-wall response and the UI says that the guestbook is
currently closed.

Only non-hidden comments are returned publicly. There is no public endpoint
for retrieving a hidden or deleted comment.

## Management portal experience

The guest-list dashboard remains the celebrant's landing page. It gains a
compact Guestbook summary containing:

- Whether the wall is enabled
- Total non-deleted comment count
- Count of comments received since the wall was last reviewed
- A link to open Guestbook management

The Guestbook management view contains:

- The enable/disable setting
- Comments ordered newest first
- Guest name, comment, timestamp, and visible/hidden status
- Hide or restore action
- Permanent delete action with confirmation
- Empty states for no comments and for a disabled wall

Disabling the wall does not change existing comment visibility flags or delete
comments. Re-enabling it restores all comments that were visible before it was
disabled. A hidden comment stays hidden until restored.

Owners, active co-hosts, and founders have identical Guestbook management
permissions. Opening the management view marks the shared wall as reviewed.
The new-comment indicator is shared at the event level: when any authorized
manager reviews the wall, it clears for the other managers too. This avoids a
per-user read-receipt subsystem in the first version.

No email or SMS is sent when a comment is created, hidden, restored, or
deleted.

## Data model

### Invitation setting

Add these fields to `invitation_events`:

- `comment_wall_enabled boolean NOT NULL DEFAULT false`
- `comment_wall_reviewed_at timestamptz NULL`

The default preserves the current behavior for all existing invitations.

### Comments

Create `invitation_comments` with:

- `id uuid PRIMARY KEY`
- `event_id uuid NOT NULL` referencing `invitation_events(id)` with cascade
  delete
- `guest_name text NOT NULL`
- `body text NOT NULL`
- `is_hidden boolean NOT NULL DEFAULT false`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`

Database checks enforce the trimmed name and body length limits. Index
`(event_id, created_at DESC, id DESC)` for public and portal pagination. A
partial index for non-hidden comments may be added if it improves the public
query without complicating the migration.

Deleting a comment is a hard delete because the user explicitly requested a
permanent removal action. Hiding is the reversible moderation path.

As with the existing invitation tables, anonymous and authenticated clients do
not receive direct table access. All reads and writes pass through server-side
repository methods using the established service-role boundary.

### Rate limiting

Create a purpose-specific submission-control table keyed by event and a one-way
hash of the requester address. Never store the raw IP address. Each recent
submission record contains its creation time, a hash of the normalized name and
body, and the resulting comment ID. A public poster may create at most five
comments per invitation in a rolling ten-minute window. These short-lived
records can be cleaned up opportunistically or by the same retention mechanism
used for other invitation rate-limit records.

To prevent accidental double posts, normalize the name and body for comparison.
If the same event, hashed requester, normalized name, and normalized body are
submitted again within two minutes, return the original successful result
instead of inserting another row. This duplicate response is successful and
does not reveal any private data beyond the comment the requester just sent.

## Server interfaces

### Public read

The public comment query accepts an invitation identifier and an opaque cursor.
It returns at most ten visible comments plus a next cursor. Public rows expose
only comment ID, guest display name, body, and creation time.

The first page is loaded with the invitation where practical; later pages use
a dedicated public route. Pagination uses `(created_at, id)` rather than an
offset so concurrent posts do not cause skipped or repeated results.

### Public create

The create route accepts event/slug context, display name, body, and the
honeypot value. The server:

1. Resolves the effective invitation state.
2. Confirms the Comment Wall is enabled.
3. Treats a populated honeypot as a no-op success without creating a comment.
4. Trims and validates the name and body.
5. Applies the event/requester rate limit and duplicate check atomically.
6. Inserts a visible comment or returns the recent duplicate.
7. Returns the safe public comment projection.

Expected domain failures use stable codes for closed wall, invalid input, and
rate limiting. Logs include the event ID and failure category but never the
comment body or raw requester address.

### Management operations

Management reads and mutations use the existing invitation-owner session and
founder authorization boundaries. Operations include:

- Enable or disable the wall
- List all non-deleted comments, including hidden comments
- Hide a visible comment
- Restore a hidden comment
- Permanently delete a comment
- Mark the wall reviewed

Every mutation verifies access to the event before addressing a comment. A
comment ID from another event must behave as not found and must not disclose
that the row exists.

## Components and boundaries

Keep the feature isolated behind small units:

- Comment validation and public projection helpers contain no database code.
- A comment repository owns persistence, pagination, rate limiting, and
  moderation mutations.
- Public API handlers translate repository/domain results to safe HTTP
  responses.
- A public Comment Wall component owns display, pagination, and the post form.
- A portal Guestbook component owns the enable switch and moderation UI.
- The owner dashboard consumes only a summary projection, not full comments.

The existing RSVP form, RSVP messages, and notification reservation flow are
not modified to implement comments.

## Error handling and accessibility

- Preserve form input on recoverable submission failures.
- Disable repeat actions while a mutation is pending.
- Announce success and errors through an accessible live region.
- Trap focus and lock background scrolling in the comment dialog using the
  proven RSVP dialog behavior.
- Give hide, restore, and delete controls explicit accessible names containing
  the guest name.
- Require confirmation only for permanent deletion, not hide/restore.
- Treat a comment removed between page load and moderation as an idempotent
  success or a harmless not-found refresh, rather than a portal crash.

## Testing

Automated coverage will include:

- Migration contract: disabled defaults, constraints, foreign key, indexes,
  and table privileges
- Validation boundaries for names and comment bodies
- Effective event-state and wall-enabled access rules
- Public projection excludes moderation and anti-spam data
- Cursor pagination and hidden-comment filtering
- Atomic rate limiting and duplicate-submission behavior
- Owner, co-host, founder, and unauthorized management access
- Enable, disable, hide, restore, delete, and mark-reviewed behavior
- Dashboard summary and shared new-comment count
- Public form success, closed-wall, validation, retry, and double-submit states
- Portal moderation interaction and deletion confirmation
- Mobile rendering and background scroll locking
- Existing invitation, RSVP, owner dashboard, and notification regressions
- Type checking, linting, full automated suite, and production build

## Rollout

The database migration must be applied before deploying application code that
selects the new invitation fields. Because the feature defaults to disabled,
deployment does not change any live invitation until an authorized manager
enables its Comment Wall.

After deployment, verify one test invitation through this sequence:

1. Confirm the wall is absent while disabled.
2. Enable it as an owner and post as a guest.
3. Confirm the comment appears publicly and in the portal.
4. Hide and restore the comment.
5. Disable and re-enable the wall without losing the comment.
6. Delete the comment and confirm it no longer appears.
