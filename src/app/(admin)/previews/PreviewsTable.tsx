"use client";

import { useState } from "react";
import { PreviewActions, BulkDeleteButton } from "./PreviewActions";

interface Preview {
  slug: string;
  business_name: string;
  business_type: string;
  template_variant: string | null;
  color_theme: string;
  group_id: string | null;
  variant_label: string | null;
  view_count: number;
  converted: boolean;
  is_selected: boolean | null;
  created_at: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  classic: "Classic",
  bold: "Bold",
  elegant: "Elegant",
  vibrant: "Vibrant",
  warm: "Warm",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PreviewsTable({ previews }: { previews: Preview[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === previews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(previews.map((p) => p.slug)));
    }
  };

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <BulkDeleteButton
            selectedSlugs={Array.from(selected)}
            onDone={() => setSelected(new Set())}
          />
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === previews.length && previews.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-3 py-3">Business</th>
              <th className="px-3 py-3">Template</th>
              <th className="hidden px-3 py-3 md:table-cell">Views</th>
              <th className="hidden px-3 py-3 md:table-cell">Status</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {previews.map((p) => (
              <tr key={p.slug} className={`hover:bg-gray-50 ${selected.has(p.slug) ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.slug)}
                    onChange={() => toggleSelect(p.slug)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">{p.business_name}</p>
                  <p className="text-xs text-gray-400">{p.business_type}{p.variant_label ? ` · Variant ${p.variant_label}` : ""}</p>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {TEMPLATE_LABELS[p.template_variant || ""] || p.template_variant || "—"}
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-sm text-gray-500 md:table-cell">
                  {p.view_count || 0}
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  {p.converted ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Converted</span>
                  ) : p.is_selected ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Selected</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-400">
                  {timeAgo(p.created_at)}
                </td>
                <td className="px-3 py-3">
                  <PreviewActions slug={p.slug} groupId={p.group_id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
