"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TemplateRenderer } from "@/components/templates";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import type { PreviewData } from "@/lib/ai/types";

interface CompareClientProps {
  previews: PreviewData[];
  groupId: string;
}

const VARIANT_STYLES: Record<string, { name: string; desc: string }> = {
  A: { name: "Design A", desc: "Bold & Energetic" },
  B: { name: "Design B", desc: "Warm & Personal" },
  C: { name: "Design C", desc: "Elegant & Premium" },
};

export function CompareClient({ previews, groupId }: CompareClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

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

  function getThemeName(preview: PreviewData): string {
    const themes = THEMES_BY_VERTICAL[preview.business_type];
    const theme = themes?.find((t) => t.id === preview.color_theme);
    return theme?.name || preview.color_theme;
  }

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <span className="text-lg font-bold text-gray-900">
              Site<span className="text-amber-600">ForOwners</span>
            </span>
            <p className="text-sm text-gray-500">
              Pick your favorite design for{" "}
              <strong>{previews[0]?.business_name}</strong>
            </p>
          </div>
          <div className="flex items-center gap-4">
            {selected && (
              <span className="hidden text-sm text-green-600 sm:block">
                Design {previews.find((p) => p.slug === selected)?.variant_label} selected
              </span>
            )}
            <Button
              onClick={handleSelect}
              disabled={!selected || saving}
              className="rounded-full bg-amber-600 px-6 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Choose This Design"}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview cards */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Here are your 3 website designs
          </h1>
          <p className="mt-2 text-gray-600">
            Click on a design to preview it full-size, then choose your favorite.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {previews.map((preview) => {
            const label = preview.variant_label || "A";
            const style = VARIANT_STYLES[label] || VARIANT_STYLES.A;
            const isSelected = selected === preview.slug;
            const isPreviewing = previewSlug === preview.slug;

            return (
              <div key={preview.slug} className="flex flex-col">
                {/* Selection header */}
                <button
                  onClick={() => setSelected(preview.slug || null)}
                  className={`flex items-center gap-3 rounded-t-2xl border-2 px-5 py-4 transition-all ${
                    isSelected
                      ? "border-amber-600 bg-amber-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                      isSelected
                        ? "border-amber-600 bg-amber-600"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{style.name}</p>
                    <p className="text-xs text-gray-500">
                      {style.desc} &middot; {getThemeName(preview)}
                    </p>
                  </div>
                </button>

                {/* Preview thumbnail */}
                <div
                  className={`relative cursor-pointer overflow-hidden border-2 border-t-0 rounded-b-2xl transition-all ${
                    isSelected ? "border-amber-600" : "border-gray-200"
                  }`}
                  style={{ height: isPreviewing ? "auto" : "500px" }}
                >
                  {!isPreviewing ? (
                    <>
                      <div className="pointer-events-none origin-top scale-[0.35] overflow-hidden" style={{ width: "286%", height: "286%" }}>
                        <TemplateRenderer data={preview} locale="en" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90" />
                      <div className="absolute bottom-4 left-0 right-0 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewSlug(preview.slug || null);
                          }}
                          className="rounded-full border-gray-300 bg-white/90 text-xs"
                        >
                          View Full Preview
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="sticky top-16 z-10 flex justify-center bg-white/90 py-2 backdrop-blur-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewSlug(null)}
                          className="rounded-full text-xs"
                        >
                          Collapse Preview
                        </Button>
                      </div>
                      <TemplateRenderer data={preview} locale="en" />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom CTA on mobile */}
      {selected && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg lg:hidden">
          <Button
            onClick={handleSelect}
            disabled={saving}
            className="w-full rounded-full bg-amber-600 py-6 text-base text-white hover:bg-amber-700"
          >
            {saving
              ? "Saving..."
              : `Choose Design ${previews.find((p) => p.slug === selected)?.variant_label}`}
          </Button>
        </div>
      )}
    </main>
  );
}
