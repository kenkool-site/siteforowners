import type { Metadata } from "next";

const PRIVATE_ROBOTS: Metadata["robots"] = { index: false, follow: false };

/**
 * Share cards stay intact (title, description, image) while the page itself
 * is noindex and canonicalizes to its own URL, not the marketing homepage.
 */
export function buildPreviewShareMetadata(input: {
  slug: string;
  name: string;
  title: string;
  description: string;
  image?: string | null;
}): Metadata {
  const path = `/preview/${input.slug}`;
  const imageBlock = input.image
    ? { images: [{ url: input.image, alt: input.name }] }
    : {};
  return {
    title: input.title,
    description: input.description,
    robots: PRIVATE_ROBOTS,
    alternates: { canonical: path },
    openGraph: {
      title: input.title,
      description: input.description,
      type: "website",
      siteName: input.name,
      url: path,
      ...imageBlock,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      ...imageBlock,
    },
  };
}
