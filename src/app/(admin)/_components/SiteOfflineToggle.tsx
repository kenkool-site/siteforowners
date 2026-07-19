"use client";

import { useState } from "react";

interface SiteOfflineToggleProps {
  tenantId: string;
  businessName: string;
  published: boolean;
  onToggled: (published: boolean) => void;
}

/**
 * Founder-only Take Offline / Bring Online switch for a DEMO tenant's public
 * site. The API refuses non-demo tenants server-side (403) — only render this
 * for demo rows. Shared by ClientActions (Clients/Demos pages) and LeadActions
 * (Prospects page) so the two surfaces can't drift.
 */
export function SiteOfflineToggle({
  tenantId,
  businessName,
  published,
  onToggled,
}: SiteOfflineToggleProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    const next = !published;
    const message = published
      ? `Take "${businessName}" offline? Visitors to its URL will see a 404. You can bring it back online anytime.`
      : `Bring "${businessName}" back online at its existing URL?`;
    if (!confirm(message)) return;
    setToggling(true);
    try {
      const res = await fetch("/api/admin/toggle-site-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, site_published: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update site");
        return;
      }
      onToggled(data.site_published);
    } catch {
      alert("Failed to update site");
    } finally {
      setToggling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={toggling}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        published
          ? "text-red-700 hover:bg-red-50"
          : "text-green-700 hover:bg-green-50"
      }`}
    >
      {toggling
        ? published
          ? "Taking offline..."
          : "Bringing online..."
        : published
          ? "Take Offline"
          : "Bring Online"}
    </button>
  );
}
