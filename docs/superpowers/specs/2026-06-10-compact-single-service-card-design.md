# Compact Single-Service Card Design

**Date:** June 10, 2026  
**Scope:** Runway website template service cards

## Goal

Reduce the excessive vertical height of a service card when a category contains
only one visible service, while showing the complete service image without
cropping.

## Selected Layout

Use a compact horizontal card for a one-service group:

- Image on the left and service details on the right.
- Preserve the complete image with `object-contain`.
- Use a dark image background so portrait and landscape images remain legible
  when their aspect ratio does not fill the image area.
- Tighten card padding, heading size, description spacing, and button spacing.
- Keep the price, duration, description, and booking action visible.

## Responsive Behavior

- At mobile widths, the card remains a two-column layout with the image taking
  approximately 42% of the width.
- The image column has a compact minimum height rather than the existing fixed
  16rem top image.
- Long descriptions remain limited to a few lines so they cannot make the
  single card excessively tall.
- Existing multi-service groups continue using the current vertical card grid.

## Detection

The layout is selected per rendered group when that group has exactly one
visible service. The existing `renderService` helper receives a compact-layout
flag so booking behavior and service content are shared between both layouts.

## Accessibility

- Preserve the image alt text, booking button label, focus styles, and minimum
  button target height.
- Do not hide service name, price, duration, or booking availability.

## Validation

- Run TypeScript compilation.
- Run the relevant service/template tests.
- Verify the Runway template at a 375px viewport with one service and with
  multiple services.
- Confirm portrait images are fully visible without clipping.
