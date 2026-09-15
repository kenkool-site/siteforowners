# Invitation Reference Recreation Design

**Date:** 2026-09-15

## Goal

Turn an uploaded, pre-designed invitation into an editable, responsive web invitation that closely preserves the reference image's visual language without displaying the reference image as the finished experience.

The separate cover photograph becomes a full-screen opening scene. The designed invitation remains a private analysis reference used to extract factual content, palette, typography characteristics, hierarchy, composition, and decorative style.

## Product principles

- Preserve the character of each reference instead of forcing every event into a visibly generic template.
- Generate structured design decisions, never executable HTML, CSS, or JavaScript.
- Keep factual extraction separate from generated copy.
- Require an explicit review before replacing saved event content or design settings.
- Keep the resulting invitation responsive, accessible, editable, and predictable.
- Analyze only when requested and reuse saved results to control AI cost.

## Guest experience

### Full-screen opening

The first viewport uses the uploaded cover photograph as a full-bleed background. The renderer applies an adaptive focal position and contrast overlay, then places the event title or honoree names and date over the image. A clear scroll cue leads into the invitation.

If no cover exists, the recreated invitation begins immediately. If the cover fails to load, the opening uses the extracted palette rather than leaving an empty area.

### Recreated invitation

Below the opening, responsive components interpret a stored design recipe. The recipe controls:

- palette roles;
- display and body typography categories;
- text hierarchy and alignment;
- section ordering;
- framed, centered, asymmetric, editorial, or layered composition;
- border weight and corner treatment;
- spacing rhythm and decorative density;
- background and overlay behavior;
- permitted decorative motifs.

The designed reference image is not rendered on the public invitation. Existing event details, calendar links, map links, RSVP totals, and the RSVP form remain functional within the recreated design.

## Owner workflow

### Media roles

- **Cover photograph:** public visual media used for the full-screen opening.
- **Designed invitation:** private visual reference used for extraction and recreation.
- **Gallery and video:** optional supporting media displayed later in the invitation.

The editor must explain these roles so a non-technical owner understands why both image uploads exist.

### Analyze invitation

An authorized founder or owner selects **Analyze invitation** after uploading the designed reference. The action:

1. verifies event-level access;
2. loads the validated private reference object;
3. runs deterministic palette analysis;
4. sends the image to a multimodal AI model using a strict structured-output schema;
5. validates and normalizes the result;
6. stores a reusable analysis draft without changing the live invitation.

The action is explicit, rate-limited, and idempotent for the same reference path and analysis version.

### Import review

The review interface compares current values with suggestions and groups them into:

- event facts;
- extracted authored notes;
- colors;
- typography;
- layout and decorative style.

Every factual field includes a confidence indicator and, when available, short source text from the image. Low-confidence or conflicting values are unselected by default. The owner can apply individual suggestions, apply a group, or apply all safe suggestions.

Applying suggestions updates the editor form first. The owner still uses the normal **Save changes** action, making the final mutation visible and reversible before publishing.

### AI-assisted wording

**Suggest wording** is a separate optional action. It may propose an introduction, RSVP prompt, dress-code note, or short event description using confirmed event facts and the extracted tone. Generated copy is labeled, editable, and never treated as text found in the image.

## Structured data

A new migration adds nullable JSONB fields to `invitation_events`:

- `design_recipe`: the currently saved, validated recipe used by the public renderer;
- `reference_analysis`: the latest normalized extraction draft and review metadata.

The analysis metadata includes the reference media path, analysis schema version, model identifier, creation time, factual suggestions with confidence, palette candidates, typography profile, composition profile, and decorative profile.

The public event projection exposes only the validated `design_recipe`. Raw analysis, confidence data, model metadata, and discarded suggestions remain private.

## Design recipe contract

The recipe uses finite enums and bounded numeric values. It does not contain arbitrary class names or CSS.

Primary sections include:

- `palette`: background, surface, primary text, secondary text, accent, and overlay colors;
- `typography`: display category, body category, weight, contrast, tracking, and scale profile;
- `composition`: layout family, alignment, maximum content width, section rhythm, and hero text placement;
- `frame`: border style, width, radius profile, and inset treatment;
- `decoration`: motif family, density, symmetry, and divider style;
- `hero`: overlay strength, text color, focal position, and minimum height;
- `contentOrder`: an allowlisted sequence of public invitation sections.

All colors are normalized six-digit hex values and checked for usable text contrast. Unsafe combinations are adjusted at render time while preserving the source palette as closely as possible.

## Analysis responsibilities

### Deterministic image analysis

Pixel analysis identifies dominant colors, supporting colors, approximate background colors, and candidate text/accent contrast. Near-duplicate colors are clustered before producing palette candidates.

### Multimodal AI analysis

The AI model identifies visible text, semantic field candidates, hierarchy, alignment, font characteristics, framing, motifs, visual mood, and proposed palette roles. It does not return executable presentation code.

### Server normalization

The server validates the model response against the finite schema, rejects unknown values, bounds numeric inputs, normalizes dates and colors, reconciles deterministic palette results, and marks conflicting facts for manual review.

## Failure behavior

- Missing designed reference: direct the owner to upload one.
- Unsupported or unreadable image: preserve the existing invitation and explain how to replace the file.
- AI timeout/provider failure: retain the upload and allow retry without changing saved fields.
- Invalid model output: reject the analysis draft and log a redacted diagnostic.
- Low-confidence extraction: show the suggestion but leave it unselected.
- Cover image failure: render a palette-based hero fallback.
- Unknown recipe version: render the safe default invitation theme.

No analysis failure may unpublish an event or alter its currently public design.

## Security, privacy, and cost controls

- Reuse existing founder and owner event authorization.
- Read only event-scoped validated media paths.
- Keep service credentials and model calls server-side.
- Never expose raw private analysis through public projections.
- Avoid logging image contents, signed URLs, addresses, emails, or extracted private text.
- Limit analysis attempts per event and per time window.
- Cache by reference path plus schema version so unchanged images are not reprocessed.
- Preserve existing media size and type validation.

## Testing strategy

- Schema and normalization unit tests for every design-recipe enum, bound, color, and fallback.
- Extraction parser tests for malformed, missing, conflicting, and low-confidence AI output.
- Route tests for authorization, rate limits, idempotency, provider failure, and private/public projection boundaries.
- Editor interaction tests for review selection, apply behavior, dirty state, and save separation.
- Public rendering tests proving the cover is the opening hero and the designed reference is never emitted publicly.
- Responsive browser tests across representative layout families and mobile/desktop widths.
- Accessibility checks for contrast fallback, keyboard review controls, headings, alternative text, and reduced motion.
- Build, lint, typecheck, and the existing invitation regression suite before deployment.

## Out of scope for the first version

- Pixel-perfect cloning of arbitrary artwork.
- Uploading or generating arbitrary fonts.
- AI-generated HTML, CSS, JavaScript, or React components.
- Automatically publishing AI changes.
- Reconstructing illustrations as editable vector artwork.
- Automatically generating a new cover photograph.
