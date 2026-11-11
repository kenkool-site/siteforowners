import { Star } from "lucide-react";
import type { HonorIcon } from "@/lib/invitations/memories/guests-of-honor";

export function HonorGlyph({ icon, className = "size-3.5" }: { icon: HonorIcon; className?: string }) {
  if (icon === "star") return <Star className={className} aria-hidden="true" />;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="9" cy="14" r="5" />
      <circle cx="15" cy="12" r="5" />
    </svg>
  );
}

export function HonorCreamLabel({ label, icon, className = "" }: { label: string; icon: HonorIcon; className?: string }) {
  return (
    <span className={`pointer-events-none inline-flex h-[22px] max-w-[90%] items-center gap-1 rounded-full bg-[#fbfaf6]/95 px-2 text-[11px] font-semibold text-[#1f4a2c] shadow-sm ${className}`}>
      <HonorGlyph icon={icon} className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
