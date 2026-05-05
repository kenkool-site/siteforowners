export const ADMIN_NAV_ICON_PATHS = {
  home: ["M4 11.5 12 4l8 7.5", "M6.5 10.5V20h11v-9.5", "M10 20v-5.5h4V20"],
  calendar: [
    "M7 3.5v4",
    "M17 3.5v4",
    "M4.5 8.5h15",
    "M6.5 5.5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z",
    "M9 12.5h.01",
    "M14 12.5h.01",
    "M9 16h.01",
  ],
  briefcase: ["M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5", "M4.5 8h15v10.5h-15Z", "M4.5 12h15"],
  edit: ["M5 18.5h4l9-9-4-4-9 9v4Z", "M13.5 6 17.5 10", "M4.5 20h15"],
  mail: ["M4.5 6.5h15v11h-15Z", "m5 8 7.5 5.5L20 8"],
  card: ["M4.5 6.5h15v11h-15Z", "M4.5 10h15", "M7.5 14.5h4"],
  settings: [
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
    "M19 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-2.1-1.2L14 3h-4l-.4 2.7a7.8 7.8 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.5A7.5 7.5 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1c.6.5 1.3.9 2.1 1.2L10 21h4l.4-2.7c.8-.3 1.5-.7 2.1-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z",
  ],
  more: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
} as const;

export type AdminNavIconName = keyof typeof ADMIN_NAV_ICON_PATHS;

export function getAdminNavIconName(label: string): AdminNavIconName {
  switch (label) {
    case "Home":
      return "home";
    case "Schedule":
      return "calendar";
    case "Orders":
    case "Services":
      return "briefcase";
    case "Updates":
      return "edit";
    case "Leads":
      return "mail";
    case "Billing":
      return "card";
    case "Settings":
      return "settings";
    default:
      return "more";
  }
}
