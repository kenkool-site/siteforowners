# Contact-Idempotent RSVP and Guest UX Design

## Goal

Make public RSVP submission idempotent by treating a normalized email address or phone number as the guest's event-scoped identity. Remove guest-facing edit-link mechanics, use celebrant names in RSVP notifications, and make the RSVP dialog scroll reliably on mobile without moving the invitation behind it.

## Product Decisions

- A guest may return to the public RSVP form and submit again without an edit link.
- Within one event, a normalized email or normalized phone number identifies an existing RSVP.
- An identical repeat submission returns “You have already responded” and creates no RSVP or notification.
- A changed repeat submission updates the existing RSVP and returns “Your response has been updated.”
- If the submitted email and phone resolve to two different RSVP records, the request fails with a contact-conflict message and changes neither record.
- Contact-based public updates are permitted only while new RSVPs are open. Existing deadline, closed, expired, offline, rate-limit, capacity, and passcode rules remain in force.
- Guest-facing copy/edit links are removed. Existing legacy edit links remain accepted for backward compatibility but new UI and confirmation emails do not expose them.
- RSVP notification subjects and headings prefer `honoree_names`, falling back to the event title only when celebrant names are blank.

## Atomic RSVP Mutation

A new migration replaces `submit_invitation_rsvp` while retaining its current arguments and administrative mode. The function continues locking the event row so contact matching, submission limits, capacity calculations, and mutation occur in one transaction.

For a public submission without an explicit RSVP ID, the function normalizes the supplied contact values and finds matching rows for the same event. No match creates a new RSVP. One distinct matching row becomes the update target. More than one distinct match raises `INVITE_CONTACT_CONFLICT`.

The mutation result expands from `created | updated` to `created | updated | unchanged`. Before updating, the function compares every guest-editable normalized field: primary name, email, phone, attendance, party size, additional names, dietary/accessibility notes, and host message. An exact match returns `unchanged` without changing `updated_at`. A changed match runs the existing capacity check against the old party size, updates the row, and returns `updated`.

Submission limits apply only to genuinely new records. Capacity is calculated excluding the chosen existing row and then including its proposed replacement, preventing double counting. Administrative edits continue identifying rows by ID and bypassing guest credential checks only after route authorization.

## Application Response and Notifications

The RSVP application layer recognizes all three mutation kinds. Public responses include a stable outcome code so the client can distinguish created, updated, and unchanged submissions. It no longer returns a guest edit URL for new submissions.

`unchanged` submissions produce no owner or guest notification. Created and materially updated submissions keep the existing policy: attending responses may notify active hosts, declines remain dashboard-only for hosts, and guest email confirmation is sent only when enabled. Guest confirmation email links back to the invitation but contains no edit-token URL.

Notification event context loads both `title` and `honoree_names` and derives one display title. Owner email subject, owner email body, owner SMS, and guest confirmation use the derived celebrant title. The invitation slogan remains available for cover presentation and does not appear as the RSVP notification title when honoree names exist.

## Guest Form UX

The public RSVP form no longer creates, saves, copies, or displays edit credentials. It may still read a credential from a legacy URL fragment so previously sent links keep working. After a successful submission it keeps the entered fields available for correction and changes the primary action to “Update response.” A created response displays “Your response has been saved,” a changed response displays “Your response has been updated,” and an identical response displays “You have already responded.” Public aggregate counts remain optional and update from the server response.

Legacy fragment edit links continue to work during the compatibility period, but the current UI does not generate or promote them. This avoids breaking previously emailed links while simplifying all new guest interactions.

## Dialog Scrolling

Opening the RSVP dialog records the page scroll position and locks the document body using fixed positioning. Closing restores the original body styles and scroll position, including Escape and component unmount paths.

The overlay fills the dynamic viewport and contains scrolling. The dialog card has its own bounded vertical scrolling with `overscroll-behavior: contain`, preventing touch/wheel chaining to the invitation. Mobile uses the full available dynamic height with a bottom-sheet shape; larger screens retain the centered card. The close control remains visible at the top while the form scrolls.

## Error Handling

- Conflicting contact matches return a dedicated, localized message asking the guest to contact the host.
- Capacity, closed RSVP, submission limit, invalid input, passcode, and rate-limit responses retain their current codes and status handling.
- Database errors fail closed and do not partially update an RSVP.
- Notification failures never roll back a successful created or updated RSVP.

## Migration and Compatibility

The change is delivered in migration `051_contact_idempotent_invitation_rsvp.sql`. It replaces the RPC but does not rewrite existing RSVP rows or remove `edit_token_hash`, allowing legacy edit links and administrative editing to remain valid.

Existing duplicate RSVP rows are not automatically merged. If a new submission's email and phone point to different legacy rows, the contact-conflict response prevents an unsafe choice; the host can reconcile those entries from the dashboard.

## Testing

Automated coverage includes:

- migration contract and atomic create/update/unchanged/contact-conflict behavior;
- normalized email and phone matching scoped to one event;
- capacity and submission-limit behavior for contact updates;
- no notification for unchanged submissions;
- celebrant-name notification subjects/bodies with title fallback;
- absence of guest copy-link UI and edit URLs in new confirmations;
- created, updated, unchanged, and conflict guest messages;
- document scroll lock, restoration, Escape close, and contained dialog scrolling;
- compatibility for legacy edit-token and administrative update paths;
- full TypeScript tests, lint/type checks, and production build.

## Out of Scope

- Email or SMS ownership verification.
- Automatically merging pre-existing duplicate RSVP records.
- Allowing contact-based updates after the RSVP deadline or while the invitation is closed.
- Multiple RSVP parties intentionally sharing the same email address or phone number within one event.
