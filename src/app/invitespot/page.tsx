import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InviteSpot",
  description: "Digital invitations and shared photos for your event.",
  applicationName: "InviteSpot",
  // Hardcoded (not NEXT_PUBLIC_INVITESPOT_APP_URL-driven) deliberately — a
  // canonical/OG URL should stay stable regardless of env config, unlike
  // invitationPublicUrl's no-subdomain fallback in
  // src/lib/invitations/public-url.ts.
  alternates: {
    canonical: "https://www.invitespot.app/",
  },
  openGraph: {
    type: "website",
    url: "https://www.invitespot.app/",
    siteName: "InviteSpot",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
};

export default function InviteSpotLandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold">InviteSpot</h1>
      <p className="max-w-md text-base text-gray-600">
        Digital invitations and shared photos for your event — full site coming soon.
      </p>
    </main>
  );
}
