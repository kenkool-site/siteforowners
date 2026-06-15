# Grand and Runway Mobile Gallery Design

## Summary

Grand and Runway will share a configurable mobile gallery layout. The default layout changes from the current auto-playing slider to a compact three-column grid that shows the first nine gallery images without cropping them. Owners and founders can restore the existing slider with one shared setting.

Desktop gallery behavior remains unchanged.

## Goals

- Make the Grand and Runway galleries easier to scan on mobile.
- Avoid cutting off portrait, landscape, or square source images.
- Prevent large galleries from creating an excessively long initial page.
- Give owners and founders a simple way to choose the existing slider.
- Keep the setting consistent when a site switches between Grand and Runway.

## Non-Goals

- Redesigning the desktop bento gallery.
- Adding a lightbox or full-screen image viewer.
- Adding separate settings for Grand and Runway.
- Changing image upload, ordering, deletion, or hero-image behavior.
- Changing gallery behavior in other templates.

## User Experience

### Default Mobile Grid

When `mobile_gallery_slider` is absent or `false`:

- The gallery renders a three-column grid on mobile.
- Each tile uses a square frame with the full source image visible.
- Images use `object-contain`, not `object-cover`, so no part of an image is cropped.
- Empty space around differently shaped images uses the existing dark gallery background.
- The initial grid displays at most nine images.
- If more than nine images exist, a branded **See More Looks** button appears below the grid.
- Selecting **See More Looks** reveals every remaining gallery image in the same grid.
- After expansion, the button changes to **Show Less** and collapses the grid back to nine images.
- When nine or fewer images exist, no expansion control is displayed.

The existing gallery heading, supporting copy, background treatment, booking call to action, and desktop presentation remain intact.

### Optional Mobile Slider

When `mobile_gallery_slider` is `true`:

- The existing Grand/Runway mobile carousel is rendered unchanged.
- Swipe, previous/next controls, active-image count, and autoplay behavior remain available.
- The nine-image limit and **See More Looks** control do not apply.

### Responsive Boundary

- Mobile grid or slider behavior applies below the existing `md` breakpoint.
- At `md` and above, the current desktop bento gallery renders all images regardless of the setting.

## Configuration

The setting is stored in:

```text
generated_copy.section_settings.mobile_gallery_slider
```

Semantics:

- `true`: use the existing mobile slider.
- `false` or missing: use the new mobile grid.

Using a single boolean keeps existing data backward-compatible and allows Grand and Runway to share the same preference.

## Owner Dashboard

The owner Photos page will include a **Mobile gallery slider** toggle near the gallery photo controls.

Supporting copy will explain:

- Off is the recommended clean grid.
- On restores the swipeable slider.
- The setting affects Grand and Runway on mobile only.

The Photos page will load the value from `section_settings`, include it in dirty-state detection, and save it through `/api/admin/images` alongside the existing gallery data.

The images API will use a read-modify-write update for `generated_copy.section_settings` so unrelated settings are preserved.

## Founder SiteEditor

The founder SiteEditor will include the same **Mobile gallery slider** toggle in the Section Visibility and Layout area.

The value initializes from `generated_copy.section_settings.mobile_gallery_slider` and is included automatically in the existing `sectionSettings` save payload.

Both editing surfaces therefore read and write the same source of truth.

## Component Changes

### `SectionSettings`

Add:

```ts
mobile_gallery_slider?: boolean;
```

### `TemplateOrchestrator`

For the shared Grand/Runway rendering branch:

- Resolve the setting with `ss.mobile_gallery_slider === true`.
- Pass the result to `RunwayGallery`.

Other template branches do not consume the setting.

### `RunwayGallery`

Add a `mobileSliderEnabled` prop that defaults to `false`.

The component will:

- Keep the current carousel implementation behind `mobileSliderEnabled`.
- Add local expanded/collapsed state for the default grid.
- Render the first nine images while collapsed.
- Render all images while expanded.
- Reset to the collapsed state if the gallery image list changes.
- Leave the desktop bento grid untouched.

Carousel effects and observers should only perform active work when slider mode is enabled. This avoids unnecessary timers and observers for the default grid.

## Accessibility

- The expansion button uses a native `button`.
- The button text clearly communicates the next action.
- Gallery images retain descriptive numbered alt text.
- The slider keeps its current region and carousel labels.
- The grid does not claim carousel semantics.
- Controls retain visible focus states and minimum practical touch sizes.
- Reduced-motion behavior remains respected in slider mode.

## Error Handling

- Missing or malformed settings fall back to the grid.
- Empty galleries continue to render nothing.
- A failed owner-dashboard save displays the existing save error and does not update the persisted snapshot.
- API validation rejects a supplied `mobile_gallery_slider` value unless it is a boolean.
- The API preserves all unrelated `generated_copy` and `section_settings` keys.

## Testing

Add focused tests for:

- Missing setting resolves to the mobile grid.
- `mobile_gallery_slider: false` resolves to the mobile grid.
- `mobile_gallery_slider: true` resolves to the mobile slider.
- The collapsed grid renders no more than nine images.
- **See More Looks** appears only when more than nine images exist.
- Expanding reveals the remaining images and offers **Show Less**.
- Owner Photos save payload includes the setting.
- The images API loads and persists the setting without removing sibling settings.
- Founder SiteEditor initializes and saves the setting.
- Grand and Runway both pass the shared setting to `RunwayGallery`.
- Other templates remain unaffected.

## Acceptance Criteria

- Grand and Runway show the clean mobile grid by default.
- No gallery image is cropped in grid mode.
- Only the first nine images appear before expansion.
- Visitors can reveal and collapse additional images.
- Owners can enable or disable the slider from Photos.
- Founders can enable or disable the slider from SiteEditor.
- Both controls persist the same setting.
- Existing desktop gallery layouts are unchanged.
- Existing slider behavior remains available when enabled.
