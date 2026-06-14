import type { BookingModePolicy } from "@/lib/admin-auth";

/**
 * Decides whether the `/booking` entry point should auto-open the in-site
 * booking calendar on load. It opens whenever the tenant has an in-site flow:
 * `in_site_only` and `both` modes, or any tenant where the legacy
 * `showInternalBooking` condition is true (services present, no booking_url).
 *
 * `external_only` tenants have no in-site calendar, so `/booking` no-ops and the
 * homepage renders normally.
 */
export function shouldAutoOpenInSiteCalendar(
  effectiveMode: BookingModePolicy,
  showInternalBooking: boolean,
): boolean {
  return (
    effectiveMode === "in_site_only" ||
    effectiveMode === "both" ||
    showInternalBooking
  );
}
