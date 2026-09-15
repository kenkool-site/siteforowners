"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { InvitationReferenceAnalysis, ExtractedFact } from "@/lib/invitations/reference-analysis";

export function ReferenceImportReview({ analysis, onApply }: { analysis: InvitationReferenceAnalysis; onApply(facts: ExtractedFact[], includeDesign: boolean): void }) {
  const t = useTranslations("invitations.editor.reference");
  const [selected, setSelected] = useState<string[]>([]);
  const [design, setDesign] = useState(true);
  useEffect(() => setSelected(analysis.facts.filter((fact) => fact.confidence >= 0.85).map((fact) => fact.key)), [analysis]);
  const confidence = (value: number) => value >= 0.85 ? t("high") : value >= 0.6 ? t("review") : t("low");
  return <section className="mt-5 border border-[#cfc3d3] bg-white p-4" aria-label={t("reviewTitle")}>
    <h4 className="text-lg font-semibold">{t("reviewTitle")}</h4><p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("reviewHelp")}</p>
    <div className="mt-4 divide-y divide-[#e5dee7]">{analysis.facts.map((fact) => <label key={fact.key} className="flex gap-3 py-3 text-sm">
      <input type="checkbox" checked={selected.includes(fact.key)} onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, fact.key])) : current.filter((key) => key !== fact.key))} className="mt-1 size-5 accent-[#6D456F]" />
      <span><strong className="block">{t(`fields.${fact.key}`)} · {confidence(fact.confidence)}</strong><span className="block text-base">{fact.value}</span>{fact.evidence && <span className="block text-xs text-[#675d6a]">{t("foundInImage", { evidence: fact.evidence })}</span>}</span>
    </label>)}
      <label className="flex gap-3 py-3 text-sm"><input type="checkbox" checked={design} onChange={(event) => setDesign(event.target.checked)} className="mt-1 size-5 accent-[#6D456F]" /><span><strong className="block">{t("design")}</strong><span className="block text-[#675d6a]">{analysis.paletteCandidates.join(" · ")}</span></span></label>
    </div>
    <button type="button" onClick={() => onApply(analysis.facts.filter((fact) => selected.includes(fact.key)), design)} disabled={selected.length === 0 && !design} className="mt-4 min-h-11 bg-[#2B2231] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("applySelected")}</button>
  </section>;
}
