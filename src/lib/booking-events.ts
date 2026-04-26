// Cross-component channel for opening / requesting booking flows. Used by
// per-service Book buttons in the Services section to trigger UI inside
// TemplateBooking without prop drilling.
//
// Two events:
//   1. open-booking-calendar — open the in-site calendar, optionally
//      preselecting a service. Used in in_site_only and both-without-deeplink.
//   2. request-booking-choice — show a "How would you like to book?" dialog
//      offering in-site OR external. Used in both-mode WITH a deep link so
//      the customer gets the same dual choice the main entry CTA offers.
//
// Listener side lives in TemplateBooking — it owns the dialog + calendar
// state and reads detail to decide what to render.

const OPEN_CAL_EVENT = "siteforowners:open-booking-calendar";
const REQUEST_CHOICE_EVENT = "siteforowners:request-booking-choice";

export type OpenBookingCalendarDetail = {
  /** Name of the service to preselect; calendar opens at the date step. */
  serviceName?: string;
};

export type RequestBookingChoiceDetail = {
  serviceName: string;
  /** Per-service deep link to the external provider (Acuity etc.). */
  deepLink: string;
};

export function openBookingCalendarForService(serviceName: string): void {
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  window.dispatchEvent(
    new CustomEvent<OpenBookingCalendarDetail>(OPEN_CAL_EVENT, {
      detail: { serviceName },
    }),
  );
}

/**
 * Show a small "How would you like to book?" dialog before opening the
 * in-site calendar. Used in `both` mode when a per-service deep link is
 * available so the customer can pick between the in-site flow and the
 * external provider, mirroring the main entry CTA's dual options.
 */
export function requestBookingChoice(serviceName: string, deepLink: string): void {
  window.dispatchEvent(
    new CustomEvent<RequestBookingChoiceDetail>(REQUEST_CHOICE_EVENT, {
      detail: { serviceName, deepLink },
    }),
  );
}

export function openBookingCalendarEventName(): string {
  return OPEN_CAL_EVENT;
}

export function requestBookingChoiceEventName(): string {
  return REQUEST_CHOICE_EVENT;
}
