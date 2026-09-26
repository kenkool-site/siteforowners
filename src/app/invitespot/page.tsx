import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InviteSpot",
  description: "Digital invitations and shared photos for your event.",
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
