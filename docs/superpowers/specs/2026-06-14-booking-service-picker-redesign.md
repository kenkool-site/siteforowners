# Booking Service Picker Redesign

**Date:** June 14, 2026  
**Scope:** Native customer booking flow and preview booking flow

## Goal

Redesign the first booking step so customers can quickly browse and search long
service menus. Each service should use its existing main service image, and the
list should scroll continuously without pagination or load-more controls.

## Selected Design

Use compact image-thumbnail rows:

- A service image appears on the left.
- The service name, duration, and price appear in the center.
- A chevron on the right communicates that the row advances the flow.
- Selecting any row immediately opens the existing date-and-time step.
- Services without an image use a simple themed placeholder rather than leaving
  an empty image slot.

The layout remains dense enough to show several services per mobile screen while
giving customers a visual way to recognize the desired style.

## Search

Place a search field above the service list:

- Search is client-side and filters immediately as the customer types.
- Matching is case-insensitive and checks the service name.
- The field includes a search icon and an accessible label.
- A clear button appears when a query is present.
- The result count updates with the filtered list.
- No matching services displays a themed empty state with a clear-search action.
- Picker copy follows the template-local `locale` state rather than the app
  route locale. English uses “Search services”, “Clear”, “service/services”,
  “No services found”, “Try another name or clear your search.”, and “Clear
  search”. Spanish uses “Buscar servicios”, “Borrar”, “servicio/servicios”,
  “No se encontraron servicios”, “Prueba otro nombre o borra la búsqueda.”,
  and “Borrar búsqueda”.

Search state is local to the service-selection step. Closing or remounting the
booking modal resets the query.

## Scrolling

The modal keeps the existing fixed header and progress indicator. Within the
content area:

- The search controls remain sticky at the top.
- All matching services render in one continuous vertical list.
- The list uses the modal's existing scroll container.
- There is no pagination, carousel, next-page button, load-more button, or
  artificial item limit.

## Data and Architecture

The existing `SimpleService` type already exposes the required `name`, `price`,
`durationMinutes`, and `image` fields. No database, API, or schema changes are
required.

Create a shared service-picker component used by both:

- `CustomerBookingFlow`
- `MockBookingCalendar`

The shared component owns search state, filtering, result count, image fallback,
and row rendering. Each parent supplies its existing service-selection callback,
so booking state transitions stay unchanged.

`TemplateOrchestrator` passes its `locale: "en" | "es"` state through
`TemplateBooking` to `CustomerBookingFlow` or `MockBookingCalendar`, and each
flow passes it to `BookingServicePicker`. Every layer accepts the prop
optionally and defaults to `"en"` so existing callers remain compatible.

## Responsive Behavior

- Mobile remains a full-screen booking modal.
- Thumbnail rows use a compact fixed-width image column and flexible text area.
- Long names wrap to two lines without colliding with duration or price.
- Desktop uses the same list inside the existing constrained modal width.
- Images use a consistent thumbnail frame and `object-cover` with top-biased
  positioning to keep hairstyle subjects visible.

## Accessibility

- Search has a visible placeholder and screen-reader label.
- Search placeholder, search label, result count, clear controls, and empty
  state copy use the exact English or Spanish labels selected by the locale
  prop.
- Clear search is a real button with a localized accessible label.
- Every service remains a keyboard-focusable button.
- Image alt text uses the service name; decorative fallback imagery is hidden.
- Focus-visible styling is preserved or improved.
- Empty search results are announced through visible status text.

## Validation

- Unit-test case-insensitive service filtering and empty-query behavior.
- Structural tests confirm both live and mock booking flows use the shared
  picker.
- Verify selection callbacks still advance to the existing details step.
- Run TypeScript compilation and relevant booking tests.
- Verify at 375px with a long service list, long service names, missing images,
  and a no-results search.
