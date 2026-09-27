export type HostClassification =
  | { kind: "root" }
  | { kind: "invitespot-root" }
  | { kind: "platform"; label: string; apex: "siteforowners" | "invitespot" | "local" }
  | { kind: "custom"; hostname: string };

function normalizeHostname(host: string): string {
  return host.split(":")[0].toLowerCase().replace(/^www\./, "");
}

// Used by the invitation pages themselves (not middleware) to redirect a
// direct hit on the legacy siteforowners.com apex — e.g. an old bookmarked
// /invite/{slug} or /invite/{slug}/memories link — to the event's
// invitespot.app equivalent, for events that have one. Deliberately a
// narrower check than classifyHost's "root" kind: that bucket also includes
// localhost and *.vercel.app, which must keep working locally/in preview
// without bouncing to a real production domain.
export function isLegacySiteforownersApex(host: string): boolean {
  return normalizeHostname(host) === "siteforowners.com";
}

export function classifyHost(host: string): HostClassification {
  const hostname = normalizeHostname(host);
  if (
    hostname === "siteforowners.com"
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
  ) return { kind: "root" };

  if (hostname === "invitespot.app") return { kind: "invitespot-root" };

  if (hostname.endsWith(".siteforowners.com")) {
    return { kind: "platform", label: hostname.slice(0, -".siteforowners.com".length).split(".")[0], apex: "siteforowners" };
  }
  if (hostname.endsWith(".invitespot.app")) {
    return { kind: "platform", label: hostname.slice(0, -".invitespot.app".length).split(".")[0], apex: "invitespot" };
  }
  if (hostname.endsWith(".localhost")) {
    return { kind: "platform", label: hostname.slice(0, -".localhost".length).split(".")[0], apex: "local" };
  }
  return { kind: "custom", hostname };
}

export function invitationRewritePath(slug: string, pathname: string): string | null {
  const encodedSlug = encodeURIComponent(slug);
  if (pathname === "/") return `/invite/${encodedSlug}`;
  if (pathname === "/memories") return `/invite/${encodedSlug}/memories`;
  // The passcode gate's own internal redirect (src/app/invite/[slug]/memories/page.tsx)
  // targets this exact path on the same host it was reached on — without this identity
  // passthrough, that redirect 404s on any platform subdomain, since neither case above
  // matches it.
  if (pathname === `/invite/${encodedSlug}` || pathname === `/invite/${encodedSlug}/memories`) return pathname;
  return null;
}
