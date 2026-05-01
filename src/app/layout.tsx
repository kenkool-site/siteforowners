import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.siteforowners.com",
  ),
  applicationName: "SiteForOwners",
  title: "SiteForOwners — Get booked without the back-and-forth",
  description:
    "Websites, booking, and owner dashboards for salons, barbers, nail shops, and local businesses.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "SiteForOwners",
    title: "SiteForOwners — Get booked without the back-and-forth",
    description:
      "Websites, booking, and owner dashboards for salons, barbers, nail shops, and local businesses.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SiteForOwners product preview with rendered booking and dashboard screens",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SiteForOwners — Get booked without the back-and-forth",
    description:
      "Websites, booking, and owner dashboards for salons, barbers, nail shops, and local businesses.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          fraunces.variable,
          "font-sans antialiased",
        )}
      >
        {children}
      </body>
    </html>
  );
}
