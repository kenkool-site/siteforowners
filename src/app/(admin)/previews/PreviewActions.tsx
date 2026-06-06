"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSubdomain } from "@/lib/subdomain";

interface PreviewActionsProps {
  slug: string;
  groupId: string | null;
  businessName?: string;
  demo?: { subdomain: string | null } | null;
  converted?: boolean;
}

export function PreviewActions({ slug, groupId, businessName, demo, converted }: PreviewActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [working, setWorking] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this preview? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: [slug] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleGoLive = async () => {
    const suggested = generateSubdomain(businessName || slug);
    const subdomain = prompt("Subdomain for the demo site:", suggested);
    if (subdomain === null) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/provision-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_slug: slug, subdomain }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to provision");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to provision");
    } finally {
      setWorking(false);
    }
  };

  const handleRevert = async () => {
    if (!confirm("Revert this demo to a plain preview? The demo tenant + subdomain will be removed.")) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/provision-demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_slug: slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to revert");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to revert");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`/preview/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        View
      </a>
      <a
        href={`/previews/${slug}/edit`}
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Edit
      </a>
      {groupId && (
        <a
          href={`/preview/compare/${groupId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Compare
        </a>
      )}
      {demo ? (
        <>
          {demo.subdomain && (
            <a
              href={`https://${demo.subdomain}.siteforowners.com`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Live demo ↗
            </a>
          )}
          <button
            onClick={handleRevert}
            disabled={working}
            className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {working ? "..." : "Revert"}
          </button>
        </>
      ) : converted ? null : (
        <button
          onClick={handleGoLive}
          disabled={working}
          className="rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          {working ? "..." : "Go live (demo)"}
        </button>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "..." : "Delete"}
      </button>
    </div>
  );
}

interface BulkDeleteProps {
  selectedSlugs: string[];
  onDone: () => void;
}

export function BulkDeleteButton({ selectedSlugs, onDone }: BulkDeleteProps) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  if (selectedSlugs.length === 0) return null;

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedSlugs.length} previews? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: selectedSlugs }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      const data = await res.json();
      if (data.protected > 0) {
        alert(`Deleted ${data.deleted}. ${data.protected} protected (linked to clients).`);
      }
      onDone();
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleBulkDelete}
      disabled={deleting}
      className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {deleting ? "Deleting..." : `Delete ${selectedSlugs.length} selected`}
    </button>
  );
}
