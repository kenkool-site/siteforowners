import type { ReactNode } from "react";
import { eventSiteFontClass } from "./event-site-fonts";

export function EventSiteFonts({ children }: { children: ReactNode }) {
  return <div className={eventSiteFontClass}>{children}</div>;
}
