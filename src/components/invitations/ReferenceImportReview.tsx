"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { InvitationReferenceAnalysis, ExtractedFact } from "@/lib/invitations/reference-analysis";
import type { InvitationEventColor } from "@/lib/invitations/style-guide";

export function ReferenceImportReview({ analysis, onApply }: {
  analysis: InvitationReferenceAnalysis;
  onApply(input: { facts: ExtractedFact[]; eventColors: InvitationEventColor[]; includeDesign: boolean }): void;
}) {
  const t = useTranslations("invitations.editor.reference");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<number[]>([]);
  const [eventColors, setEventColors] = useState(() => analysis.eventColors.map(({ name, color }) => ({ name, color })));
  const [design, setDesign] = useState(true);
  useEffect(() => {
    setSelected(analysis.facts.filter((fact) => fact.confidence >= 0.85).map((fact) => fact.key));
    setSelectedColors(analysis.eventColors.flatMap((color, index) => color.confidence >= 0.85 ? [index] : []));
    setEventColors(analysis.eventColors.map(({ name, color }) => ({ name, color })));
  }, [analysis]);
  const confidence = (value: number) => value >= 0.85 ? t("high") : value >= 0.6 ? t("review") : t("low");
  return <section className="mt-5 border border-[#cfc3d3] bg-white p-4" aria-label={t("reviewTitle")}>
    <h4 className="text-lg font-semibold">{t("reviewTitle")}</h4><p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("reviewHelp")}</p>
    <div className="mt-4 divide-y divide-[#e5dee7]">{analysis.facts.map((fact) => <label key={fact.key} className="flex gap-3 py-3 text-sm">
      <input type="checkbox" checked={selected.includes(fact.key)} onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, fact.key])) : current.filter((key) => key !== fact.key))} className="mt-1 size-5 accent-[#6D456F]" />
      <span><strong className="block">{t(`fields.${fact.key}`)} · {confidence(fact.confidence)}</strong><span className="block text-base">{fact.value}</span>{fact.evidence && <span className="block text-xs text-[#675d6a]">{t("foundInImage", { evidence: fact.evidence })}</span>}</span>
    </label>)}
      {analysis.eventColors.map((color, index) => <div key={`${color.name}:${index}`} className="grid gap-3 py-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="flex min-h-11 items-center gap-3 sm:self-center">
          <input type="checkbox" checked={selectedColors.includes(index)} onChange={(event) => setSelectedColors((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} className="size-5 accent-[#6D456F]" />
          <span className="font-semibold">{t("eventColor")} · {confidence(color.confidence)}</span>
        </label>
        <label>{t("colorName")}<input name={`eventColorName${index}`} value={eventColors[index]?.name ?? ""} onChange={(event) => setEventColors((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="mt-1 min-h-11 w-full rounded-md border border-[#d8cedc] px-3" /></label>
        <label>{t("colorValue")}<input type="color" name={`eventColorValue${index}`} value={eventColors[index]?.color ?? "#000000"} onChange={(event) => setEventColors((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value.toUpperCase() } : item))} className="mt-1 h-11 w-16 rounded-md border border-[#d8cedc] bg-white p-1" /></label>
        {color.evidence && <span className="text-xs text-[#675d6a] sm:col-start-2 sm:col-span-2">{t("foundInImage", { evidence: color.evidence })}</span>}
      </div>)}
      <label className="flex gap-3 py-3 text-sm"><input type="checkbox" checked={design} onChange={(event) => setDesign(event.target.checked)} className="mt-1 size-5 accent-[#6D456F]" /><span><strong className="block">{t("design")}</strong><span className="block text-[#675d6a]">{analysis.paletteCandidates.join(" · ")}</span></span></label>
    </div>
    <button type="button" onClick={() => onApply({ facts: analysis.facts.filter((fact) => selected.includes(fact.key)), eventColors: eventColors.filter((_, index) => selectedColors.includes(index)), includeDesign: design })} disabled={selected.length === 0 && selectedColors.length === 0 && !design} className="mt-4 min-h-11 bg-[#2B2231] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("applySelected")}</button>
  </section>;
}
