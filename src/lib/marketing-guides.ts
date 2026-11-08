export type MarketingGuide = {
  path: `/${string}`;
  label: string;
  summary: string;
  title: string;
  description: string;
};

export const MARKETING_GUIDES = [
  {
    path: "/website-for-hair-braiders",
    label: "Website for hair braiders",
    summary: "What belongs on a braider’s site: services, photos, prices, and one way to book.",
    title: "Website for hair braiders | SiteForOwners",
    description:
      "What a hair braider’s website needs: a service menu, photos of your work, prices, and booking that does not depend on DMs. Done for you, then $50 a month after a free month.",
  },
  {
    path: "/booking-website-for-braiders",
    label: "Booking website for braiders",
    summary: "How online booking replaces the length, date, and deposit thread.",
    title: "Booking website for braiders | SiteForOwners",
    description:
      "A booking website for braiders lists the style, the time, and the price so clients stop asking in DMs. You get a text when someone books. $50 a month after a free month.",
  },
  {
    path: "/hair-stylist-website-builder",
    label: "Hair stylist website builder",
    summary: "A stylist site built for you, plus a dashboard for prices, bookings, and leads.",
    title: "Hair stylist website builder | SiteForOwners",
    description:
      "A hair stylist website builder that is done for you: portfolio, services, booking, and an owner dashboard. Free for a month, then $50 a month. You own the domain.",
  },
] as const satisfies readonly MarketingGuide[];
