# Mobile Service Editor UX Design

## Goal

Make adding and editing owner services on a phone stable and self-explanatory without redesigning the existing admin dashboard.

The updated experience must prevent iPhone input zoom, horizontal page movement, hidden save actions, and uncertainty after adding a service.

## Chosen Approach

Use an in-page editor with guided scrolling and a safe sticky save bar.

Alternatives considered:

- A full-screen service editor would isolate each edit, but would introduce a larger navigation and state-management change.
- Adding new services at the top would make them visible, but would silently change the owner’s intended public service order.

The chosen approach preserves the existing editing model and service order while fixing the mobile interaction problems directly.

## Add Service Flow

When the owner taps **Add service**:

1. Append one blank service to the existing list.
2. Render it expanded.
3. Smoothly scroll the new service card into view.
4. Focus the **Service name** input after scrolling.
5. Show a short inline cue that the new service has been added and should be completed before saving.

The new card remains at the bottom because service order controls public display order.

## Mobile Editing Stability

- Text inputs, textareas, and selects use a minimum 16px font size on mobile to prevent automatic iOS Safari zoom.
- Desktop text sizing may remain compact through responsive classes.
- Add-on fields use a mobile grid or stacked layout so no row can exceed the viewport width.
- Duration controls must shrink safely and remain usable without forcing page overflow.
- Reorder controls and service cards retain `min-width: 0` boundaries.
- No editor control may create horizontal document scrolling at a 320px viewport.

## Save Experience

- The save bar appears only when there are unsaved changes or an active save error.
- On mobile it sits above the floating admin navigation, including safe-area spacing.
- The page receives enough bottom padding that the final editor controls are never covered by either fixed bar.
- The save bar uses a compact horizontal layout: status on the left, action on the right.
- During saving, the action is disabled and reads **Saving…**.
- After a successful save, the bar briefly shows **Saved ✓**, then disappears.
- Validation or network errors keep the bar visible and readable without expanding beyond the viewport.
- Saving continues to collapse valid service cards while reopening invalid cards.

## Existing Behavior Preserved

- Service creation remains local until the owner taps **Save changes**.
- Categories, booking policies, deposits, images, add-ons, deletion, and reordering continue to use the existing API payload.
- Service order remains unchanged except through explicit reorder actions.
- Desktop behavior and visual styling remain substantially unchanged.

## Implementation Boundaries

- `ServicesClient` owns new-service identity, scroll intent, save-bar visibility, and saved confirmation timing.
- `ServiceRow` accepts an autofocus signal for the newly created row and owns focusing its name input.
- `ServiceRow` also receives the responsive input and add-on layout fixes.
- Pure helper logic should be extracted only where it enables focused tests.

## Verification

- Add focused tests for new-service creation/target selection and save-bar state where practical.
- Run the existing service and navigation tests.
- Run TypeScript validation and the production build.
- Verify in a browser at 320px, 375px, and 390px widths:
  - Add service scrolls to and focuses the new card.
  - Focusing every editable field does not zoom the page.
  - Add-ons do not cause horizontal overflow.
  - Save bar never overlaps the floating navigation.
  - Saved confirmation disappears after a short delay.
