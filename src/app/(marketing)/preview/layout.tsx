import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private website preview — SiteForOwners",
  description: "A private website preview for review. This page is not listed in search results.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/preview" },
  openGraph: {
    title: "Private website preview — SiteForOwners",
    description: "A private website preview for review. This page is not listed in search results.",
    url: "/preview",
  },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
