"use client";

import { useState } from "react";

interface ClientActionsProps {
  tenantId: string;
  businessName: string;
  subdomain: string | null;
  customDomain: string | null;
  sitePublished: boolean;
}

export function ClientActions({
  tenantId,
  businessName,
  subdomain,
  customDomain,
  sitePublished,
}: ClientActionsProps) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(sitePublished);
  const [siteSubdomain, setSiteSubdomain] = useState(subdomain);
  const [editingSubdomain, setEditingSubdomain] = useState(false);
  const [customSubdomain, setCustomSubdomain] = useState(subdomain || "");

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
