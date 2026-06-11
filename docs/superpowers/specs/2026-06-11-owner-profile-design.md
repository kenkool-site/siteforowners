# Owner Profile Design

**Date:** 2026-06-11

## Goal

Give each business owner one simple Profile page in the owner dashboard for managing their business identity, personal information shown on their public website, private account email, and the PIN used to enter the dashboard.

## User Experience

Add a `Profile` destination to the owner admin navigation. The page uses a mobile-first, single-column card layout in this order:

1. Business name, phone number, homepage tagline, and private owner email
2. Personal photo
3. About Me in English and Spanish
4. Instagram, Facebook, and TikTok handles
5. Save Profile action
6. Change PIN

The same vertical flow remains on desktop inside a wider centered content column. This preserves the simple layout approved in the visual mockup and avoids presenting a different information hierarchy on larger screens.

The Profile page replaces the owner-facing About photo controls in `Photos` and the PIN controls in `Settings`. The separate `Photos` and `Settings` navigation entries are removed. Gallery and gallery-video management remain available through a Photos page linked from the Profile page or another appropriate owner-admin entry; the personal About photo is managed only from Profile.

On mobile, Profile is always visible in the sticky top bar as a labeled portrait/avatar button beside `View site`. The existing envelope/Leads shortcut and Sign Out action are removed from the mobile top bar to prevent crowding. Leads remains available through `More` and dashboard lead summaries, while Sign Out moves into the Profile page.

## Data Model

No new profile table or duplicate profile fields are introduced. Profile reuses the existing public-site data:

- Business name: `previews.business_name`, mirrored to `tenants.business_name`
- Public phone number: `previews.phone`, mirrored to `tenants.phone` and `tenants.sms_phone`
- Homepage tagline: `previews.generated_copy.en.hero_subheadline`
- Private owner email: `tenants.admin_email`
- Personal photo: `previews.generated_copy.section_settings.about_image_url`
- English About Me: `previews.generated_copy.en.about_paragraphs`
- Spanish About Me: `previews.generated_copy.es.about_paragraphs`
- Social handles: `previews.generated_copy.social_links`
- Dashboard PIN: `tenants.admin_pin_hash` and `tenants.admin_pin_updated_at`

The owner session remains the authoritative tenant source. Client requests must not provide or choose a tenant ID.

## Profile Loading

The Profile page is server-rendered using the tenant resolved from the `[slug]` admin route. It loads the tenant's linked preview through `tenant.preview_slug`.

The page supplies a client form with:

- Current business name
- Current public phone number
- Current English homepage tagline
- Current private owner email
- Current About image URL or `null`
- English About paragraphs joined into editable text
- Spanish About paragraphs joined into editable text
- Social links converted from stored URLs into owner-friendly handles

Missing preview or copy values produce empty fields without preventing the Profile page from loading.

## Profile Saving

Add an owner-authenticated profile API endpoint. The endpoint:

1. Resolves the owner session and tenant from the request host.
2. Loads the preview through the authenticated tenant's `preview_slug`.
3. Validates and normalizes the submitted Profile values.
4. Performs a read-modify-write of `generated_copy`.
5. Updates the preview-level business name and phone.
6. Mirrors the business name and phone to the tenant row.
7. Updates `tenants.admin_email` separately from public website data.
8. Preserves all unrelated generated copy, locale fields, section settings, and social data.
9. Returns the normalized saved profile.

The update must be tenant-scoped through the authenticated session. Founder access is not needed for this owner-only Profile endpoint because the founder Site Editor already edits these values.

The profile save may touch both the preview and tenant rows. The endpoint validates the complete payload before writing either record. If either database update fails, the API reports a save failure and the form retains the owner's edits. The implementation should minimize drift by using the existing update patterns and by treating the preview and tenant values returned after saving as the new persisted snapshot.

## Business Information

The Profile page includes:

- **Business name:** Required public business name. Saving updates both `previews.business_name` and `tenants.business_name`.
- **Phone number:** Public contact phone. Saving updates `previews.phone` and mirrors the normalized value to `tenants.phone` and `tenants.sms_phone`, matching the existing Site Editor behavior used for owner SMS notifications.
- **Tagline:** The short homepage sentence under the primary business heading. It updates the existing English `hero_subheadline` field and does not create a separate tagline field.
- **Owner email:** Private dashboard email used for owner notices and PIN recovery. It updates `tenants.admin_email` and is never added to public preview data or rendered on the website.

Validation:

- Business name is trimmed, required, and length-limited.
- Phone accepts the same practical phone formats already supported by Site Editor and is normalized consistently before mirroring.
- Tagline is trimmed and length-limited.
- Owner email is required to be a valid email address when supplied.

The Profile UI clearly labels the owner email as private.

## About Me Editing

The English and Spanish fields are both visible as separate labeled text areas. The form stores each language as an array of paragraphs by splitting on blank lines, trimming whitespace, and removing empty paragraphs.

Validation:

- Each language is optional.
- Each language has a maximum total character count.
- Paragraph count is capped to prevent oversized JSON payloads.
- Saving one language never overwrites unrelated locale fields such as hero copy, service descriptions, SEO copy, or footer copy.
- Saving About Me never overwrites the English homepage tagline stored beside it in `generated_copy.en`.

The public templates continue reading `about_paragraphs`, so saved changes appear automatically in the About Us section.

## Personal Photo

Reuse the existing image upload mechanism and storage bucket. The Profile photo control shows the current portrait, supports upload and replacement, and supports clearing the portrait.

The saved URL is written only to `section_settings.about_image_url`. It is not added to the public gallery. Public templates already prefer this field for the About Us image, so no template-specific data duplication is required.

The existing About photo selector is removed from the owner Photos experience. Gallery photo selection is not included in Profile; Profile is intentionally focused on uploading a personal portrait.

## Social Media

Profile includes Instagram, Facebook, and TikTok fields. Owners may enter handles or complete URLs.

The existing `social-links` helpers remain the normalization source:

- Stored URLs are displayed as friendly handles where possible.
- Handles are converted to canonical platform URLs on save.
- Empty fields remove the corresponding platform.

Saved links continue powering the existing website social-link components.

## PIN Security

The existing `ChangePinForm` and `/api/admin/pin/change` endpoint remain the security implementation and move into Profile.

PIN changes are submitted separately from public profile changes. The owner must provide the current PIN and a valid new PIN. Profile content remains intact when a PIN update fails, and PIN changes do not trigger a profile-content save.

The UI consistently calls the credential `PIN`, matching the existing six-digit owner-admin experience.

PIN recovery accepts the updated private owner email through the existing `admin_email` lookup.

## Navigation and Existing Pages

Add a Profile icon mapping and a `/admin/profile` tab.

Remove the owner navigation entries for `Photos` and `Settings`. The `/admin/settings` route may remain temporarily for compatibility, but its PIN form must not remain as an active duplicate. The `/admin/photos` route remains responsible for gallery and gallery-video management but no longer manages the About photo.

Profile should include a clear link to gallery management so owners can still reach the Photos page after its bottom-navigation entry is removed.

The desktop sidebar includes Profile after Billing. On mobile, Profile is not hidden in `More`; the sticky header avatar is the primary entry.

## Error Handling

- Profile load failures render a usable page with an inline error state rather than leaking internal details.
- Validation errors identify the affected field.
- The private owner email is never returned by public preview endpoints.
- Upload errors leave existing form values unchanged.
- Save failures retain all unsaved form input.
- Successful saves update the local persisted snapshot and show a concise confirmation.
- The Save Profile button is disabled while saving and when no public profile fields have changed.
- PIN errors remain local to the PIN card.

## Testing

Add focused coverage for:

- Profile payload validation and paragraph normalization
- Business name, phone, tagline, and owner email validation
- Business name synchronization between preview and tenant
- Phone synchronization across preview, tenant phone, and SMS phone
- Private owner email updating `admin_email` without entering public preview data
- Homepage tagline updating `en.hero_subheadline` while preserving sibling English copy
- Social handle normalization through the profile save path
- Preservation of unrelated `generated_copy` and `section_settings` fields
- English and Spanish About content updating independently
- Owner-session tenant scoping
- Rejection of unauthenticated requests
- Profile navigation label and icon mapping
- Photos no longer rendering the About image picker
- Settings no longer rendering the Change PIN form
- Profile rendering the photo, bilingual About, social, and PIN sections

Run the relevant TypeScript tests, strict type checking, and a browser verification at 375px width.

## Out of Scope

- Adding new social platforms
- Translating About Me automatically
- Displaying the private owner email on the public website
- Adding a separate tagline database field
- Changing the public section title from `About Us`
- Adding the portrait to the gallery
- Creating a separate owner biography or profile database table
