import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { classifyHost } from "@/lib/host-routing";

export function buildInvitespotSitemap(host: string | null): MetadataRoute.Sitemap {
  if (!host || classifyHost(host).kind !== "invitespot-root") return [];
  return [
    {
      url: "https://www.invitespot.app/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const host = headers().get("host");
  return buildInvitespotSitemap(host);
}
