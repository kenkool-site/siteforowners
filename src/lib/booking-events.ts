// Cross-component channel for "open the in-site booking calendar." Used by
// per-service Book buttons in the Services section to trigger the calendar
// inside TemplateBooking, optionally preselecting a specific service so the
// customer doesn't have to repick what they just clicked on.
//
// Listener side lives in TemplateBooking — it reads `detail.serviceName`,
// matches it against the services list, and seeds the calendar's initial
// state.

const EVENT_NAME = "siteforowners:open-booking-calendar";

export type OpenBookingCalendarDetail = {
  /** Name of the service to preselect; calendar opens at the date step. */
  serviceName?: string;
};

export function openBookingCalendarForService(serviceName: string): void {
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  window.dispatchEvent(
    new CustomEvent<OpenBookingCalendarDetail>(EVENT_NAME, {
      detail: { serviceName },
    }),
  );
}

export function openBookingCalendarEventName(): string {
  return EVENT_NAME;
}
