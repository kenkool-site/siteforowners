import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { classifyHost } from "@/lib/host-routing";

export function buildInvitespotRobots(host: string | null): MetadataRoute.Robots {
  if (!host || classifyHost(host).kind !== "invitespot-root") {
    return { rules: { userAgent: "*", allow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://www.invitespot.app/sitemap.xml",
  };
}

export default function robots(): MetadataRoute.Robots {
  const host = headers().get("host");
  return buildInvitespotRobots(host);
}
