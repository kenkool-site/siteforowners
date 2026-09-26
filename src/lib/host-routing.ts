export type HostClassification =
  | { kind: "root" }
  | { kind: "invitespot-root" }
  | { kind: "platform"; label: string; apex: "siteforowners" | "invitespot" | "local" }
  | { kind: "custom"; hostname: string };

export function classifyHost(host: string): HostClassification {
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "");
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
  if (pathname === "/") return `/invite/${encodeURIComponent(slug)}`;
  if (pathname === "/memories") return `/invite/${encodeURIComponent(slug)}/memories`;
  return null;
}
