"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import type { PreviewData } from "@/lib/ai/types";

interface CompareClientProps {
  previews: PreviewData[];
  groupId: string;
}

const TEMPLATE_META: Record<string, { desc: string; icon: string }> = {
  classic: { desc: "Clean & Professional", icon: "💼" },
  bold: { desc: "Bold & Modern", icon: "🔥" },
  elegant: { desc: "Elegant & Minimal", icon: "✨" },
  vibrant: { desc: "Fun & Energetic", icon: "🎉" },
  warm: { desc: "Warm & Personal", icon: "🤝" },
};

export function CompareClient({ previews, groupId }: CompareClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/select-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, slug: selected }),
      });
      if (!res.ok) throw new Error("Failed to save selection");
      router.push(`/preview/${selected}`);
    } catch {
      setSaving(false);
    }
  };

  function getTheme(preview: PreviewData) {
    const themes = THEMES_BY_VERTICAL[preview.business_type];
    return themes?.find((t) => t.id === preview.color_theme);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-5">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-lg font-bold text-gray-900">
            Site<span className="text-amber-600">ForOwners</span>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Your {previews.length} website design{previews.length > 1 ? "s are" : " is"} ready
          </h1>
          <p className="mt-3 text-gray-600">
            Preview each one, then pick your favorite for{" "}
            <strong>{previews[0]?.business_name}</strong>.
          </p>
        </div>

        <div className="space-y-4">
          {previews.map((preview) => {
            const label = preview.variant_label || "A";
            const templateName = preview.template_variant || "classic";
            const meta = TEMPLATE_META[templateName] || TEMPLATE_META.classic;
            const theme = getTheme(preview);
            const isSelected = selected === preview.slug;
            const headline = preview.generated_copy?.en?.hero_headline;

            return (
              <div
                key={preview.slug}
                className={`overflow-hidden rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-amber-600 shadow-lg"
                    : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                }`}
              >
                <div className="flex items-stretch">
                  {/* Color swatch strip */}
                  {theme && (
                    <div className="hidden w-3 flex-shrink-0 sm:block" style={{ backgroundColor: theme.colors.primary }} />
                  )}

                  <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.icon}</span>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Design {label}
                        </h3>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                          {meta.desc}
                        </span>
                      </div>
                      {headline && (
                        <p className="mt-1.5 text-sm text-gray-600 italic">
                          &ldquo;{headline}&rdquo;
                        </p>
                      )}
                      {theme && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex gap-1">
                            {theme.previewSwatch.map((color, i) => (
                              <div
                                key={i}
                                className="h-5 w-5 rounded-full border border-gray-200"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">{theme.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <a
                        href={`/preview/${preview.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        Preview
                      </a>
                      <button
                        onClick={() => setSelected(preview.slug || null)}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected
                            ? "border-amber-600 bg-amber-600"
                            : "border-gray-300 hover:border-amber-400"
                        }`}
                      >
                        {isSelected && (
                          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-8 text-center">
          <Button
            onClick={handleSelect}
            disabled={!selected || saving}
            className="rounded-full bg-amber-600 px-10 py-6 text-base text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : selected
                ? `Choose Design ${previews.find((p) => p.slug === selected)?.variant_label}`
                : "Select a design above"}
          </Button>
          <p className="mt-3 text-xs text-gray-400">
            Preview each design in a new tab, then come back and select your favorite.
          </p>
          <button
            onClick={() => router.push(`/preview?edit=${groupId}`)}
            className="mt-3 text-xs font-medium text-amber-600 underline underline-offset-2 hover:text-amber-700"
          >
            Edit inputs & regenerate
          </button>
        </div>
      </div>
    </main>
  );
}
