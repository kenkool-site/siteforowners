"use client";

import { TemplateOrchestrator } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";

interface SiteClientProps {
  data: PreviewData;
}

export function SiteClient({ data }: SiteClientProps) {
  // Published site — no preview chrome, just the raw template
  return (
    <div className="min-h-screen">
      <TemplateOrchestrator data={data} locale="en" isLive />
    </div>
  );
}
