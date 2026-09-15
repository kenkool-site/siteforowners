import type { CSSProperties } from "react";
import type { InvitationDesignRecipe } from "@/lib/invitations/design-recipe";

type FrameStyle = InvitationDesignRecipe["frame"]["style"];

function Corner({ position, floral }: { position: "tl" | "tr" | "bl" | "br"; floral: boolean }) {
  const placement = { tl: "left-1 top-1", tr: "right-1 top-1 rotate-90", br: "bottom-1 right-1 rotate-180", bl: "bottom-1 left-1 -rotate-90" }[position];
  return (
    <svg viewBox="0 0 120 120" className={`absolute h-24 w-24 sm:h-32 sm:w-32 ${placement}`} fill="none">
      <path d="M9 105C29 79 39 50 43 12M13 89C31 82 42 70 47 55M24 66C36 64 44 56 49 43" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 77C10 75 8 62 11 54C24 57 31 66 25 77ZM40 51C26 46 27 33 32 26C43 32 48 43 40 51ZM46 31C48 17 61 14 69 17C66 30 57 36 46 31Z" fill="currentColor" opacity=".76" />
      {floral && <g transform="translate(45 42)"><circle r="15" fill="currentColor" opacity=".28"/><circle cx="-8" cy="-4" r="7" fill="currentColor"/><circle cx="8" cy="-4" r="7" fill="currentColor"/><circle cy="8" r="7" fill="currentColor"/><circle r="4" fill="white" opacity=".72"/></g>}
    </svg>
  );
}

export function InvitationFrame({ style, color, width, radius }: { style: FrameStyle; color: string; width: number; radius: InvitationDesignRecipe["frame"]["radius"] }) {
  if (style === "none") return null;
  const rounded = radius === "rounded" ? "2rem" : radius === "soft" ? ".75rem" : 0;
  const borderStyle = style === "double" ? "double" : "solid";
  const borderWidth = Math.max(width, style === "double" ? 3 : 1);
  const border = { borderColor: color, borderStyle, borderWidth, borderRadius: rounded, color } as CSSProperties;
  const decorative = style === "botanical" || style === "floral";
  return (
    <div data-invitation-frame={style} aria-hidden="true" className="pointer-events-none absolute inset-4 z-10 sm:inset-7" style={border}>
      {decorative && <><Corner position="tl" floral={style === "floral"} /><Corner position="tr" floral={style === "floral"} /><Corner position="bl" floral={style === "floral"} /><Corner position="br" floral={style === "floral"} /></>}
      {style === "ornamental" && <><span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-current px-3 text-xl">◆</span><span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-current px-3 text-xl">◆</span><span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl">✦</span><span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-xl">✦</span></>}
    </div>
  );
}
