"use client";

import { useState } from "react";

interface ClientActionsProps {
  tenantId: string;
  businessName: string;
  subdomain: string | null;
  customDomain: string | null;
  sitePublished: boolean;
  isDemo: boolean;
}

export function ClientActions({
  tenantId,
  businessName,
  subdomain,
  customDomain,
  sitePublished,
  isDemo,
}: ClientActionsProps) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(sitePublished);
  const [siteSubdomain, setSiteSubdomain] = useState(subdomain);
  const [editingSubdomain, setEditingSubdomain] = useState(false);
  const [customSubdomain, setCustomSubdomain] = useState(subdomain || "");
  const [moving, setMoving] = useState(false);
  const [movedToProspect, setMovedToProspect] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/publish-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          subdomain: customSubdomain.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to publish");
        return;
      }
      const data = await res.json();
      setPublished(true);
      setSiteSubdomain(data.subdomain);
      setEditingSubdomain(false);
    } catch {
      alert("Failed to publish site");
    } finally {
      setPublishing(false);
    }
  };

  const handleSetPin = async () => {
    if (!confirm("Generate new PIN? The current one will stop working.")) return;
    const res = await fetch("/api/admin/pin/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (!res.ok) {
      alert("Failed to set PIN");
      return;
    }
    const { pin } = await res.json();
    alert(`New PIN: ${pin}\n\nShare with owner. You won't see it again.`);
  };

  const handleMoveToProspect = async () => {
    if (
      !confirm(
        `Move "${businessName}" to Prospects? The live demo stays up — this just lets you onboard them from the Prospects page.`,
      )
    )
      return;
    setMoving(true);
    try {
      const res = await fetch("/api/admin/move-to-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to move to prospect");
        return;
      }
      setMovedToProspect(true);
      alert(
        data.alreadyExists
          ? "Already in Prospects — onboard them from the Prospects page."
          : "Moved to Prospects. Onboard them from the Prospects page.",
      );
    } catch {
      alert("Failed to move to prospect");
    } finally {
      setMoving(false);
    }
  };

  const subdomainUrl = siteSubdomain
    ? `https://${siteSubdomain}.siteforowners.com`
    : null;
  const customDomainUrl = customDomain ? `https://${customDomain}` : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/clients/${tenantId}/edit`}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Edit Site
      </a>
      <button
        type="button"
        onClick={handleSetPin}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-50"
      >
        Set/Reset PIN
      </button>

      {isDemo && !movedToProspect && (
        <button
          type="button"
          onClick={handleMoveToProspect}
          disabled={moving}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          {moving ? "Moving..." : "Move to Prospect"}
        </button>
      )}
      {movedToProspect && (
        <span className="text-xs font-medium text-amber-700">
          In Prospects →
        </span>
      )}

      {published && (customDomainUrl || subdomainUrl) ? (
        <>
          {customDomainUrl && (
            <a
              href={customDomainUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200"
            >
              {customDomain}
            </a>
          )}
          {subdomainUrl && (
            <a
              href={subdomainUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                customDomainUrl
                  ? "border text-gray-500 hover:bg-gray-100"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
              }`}
            >
              {siteSubdomain}.siteforowners.com
            </a>
          )}
        </>
      ) : (
        <>
          {editingSubdomain ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customSubdomain}
                onChange={(e) =>
                  setCustomSubdomain(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                  )
                }
                placeholder={businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                className="w-32 rounded-lg border px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400">.siteforowners.com</span>
            </div>
          ) : null}
          <button
            onClick={() => {
              if (!editingSubdomain) {
                setEditingSubdomain(true);
                return;
              }
              handlePublish();
            }}
            disabled={publishing}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {publishing ? "Publishing..." : editingSubdomain ? "Go Live" : "Publish"}
          </button>
          {editingSubdomain && (
            <button
              onClick={() => setEditingSubdomain(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}
