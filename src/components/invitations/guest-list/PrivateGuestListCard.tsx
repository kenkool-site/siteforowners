"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrivateGuestListCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("invitations.editor.privateGuestList");
  const [on, setOn] = useState(enabled);
  return (
    <section className="rounded-2xl border border-[#E4DCCE] bg-white px-5 py-5 text-[#14261A]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {t("title")}
            <span className="rounded-full bg-[#f1e6cf] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#6d5320]">{t("badge")}</span>
          </h3>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-[#5E6F61]">{on ? t("on") : t("off")}</p>
          <div className="mt-3.5 flex gap-2.5 rounded-xl border border-[#E4DCCE] bg-[#FBF8F2] p-3 text-[13px] leading-relaxed">
            <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{t.rich("note", { strong: (chunks) => <strong className="font-semibold">{chunks}</strong> })}</p>
          </div>
        </div>
        <label className="relative mt-0.5 inline-flex h-7 w-[46px] shrink-0 cursor-pointer">
          <input
            type="checkbox"
            name="privateGuestListEnabled"
            checked={on}
            onChange={(event) => setOn(event.target.checked)}
            aria-label={t("title")}
            className="peer sr-only"
          />
          <span className="block h-7 w-[46px] rounded-full bg-[#D5D0C6] shadow-[inset_0_1px_2px_rgba(20,38,26,.08)] peer-checked:bg-[#1A3D24] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#1A3D24]" />
          <span className="pointer-events-none absolute left-[3px] top-[3px] size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.18)] transition-transform peer-checked:translate-x-[18px]" />
        </label>
      </div>
    </section>
  );
}
