import { Cormorant_Garamond, Outfit } from "next/font/google";

const eventDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-event-display",
});

const eventSans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-event-sans",
});

export const eventSiteFontClass = `${eventDisplay.variable} ${eventSans.variable} ${eventSans.className}`;
