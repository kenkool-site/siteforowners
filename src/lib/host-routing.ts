export type HostClassification =
  | { kind: "root" }
  | { kind: "platform"; label: string }
  | { kind: "custom"; hostname: string };

export function classifyHost(host: string): HostClassification {
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "");
  if (
    hostname === "siteforowners.com"
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
  ) return { kind: "root" };

  if (hostname.endsWith(".siteforowners.com")) {
    return { kind: "platform", label: hostname.slice(0, -".siteforowners.com".length).split(".")[0] };
  }
  if (hostname.endsWith(".localhost")) {
    return { kind: "platform", label: hostname.slice(0, -".localhost".length).split(".")[0] };
  }
  return { kind: "custom", hostname };
}

export function invitationRewritePath(slug: string, pathname: string): string | null {
  return pathname === "/" ? `/invite/${encodeURIComponent(slug)}` : null;
}
