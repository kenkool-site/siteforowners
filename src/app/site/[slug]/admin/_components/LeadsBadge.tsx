import Link from "next/link";

export function LeadsBadge({ unreadCount, variant }: { unreadCount: number; variant: "mobile" | "desktop" }) {
  const badgeBase =
    variant === "mobile"
      ? "relative inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-pink-50 px-3 text-xs font-black text-pink-700 ring-1 ring-pink-100 transition hover:bg-pink-100"
      : "relative inline-flex w-full items-center justify-between rounded-2xl border border-pink-100 bg-white px-3 py-3 text-sm font-black text-pink-700 transition hover:bg-pink-50";
  return (
    <Link href="/admin/leads" aria-label={`Leads — ${unreadCount} unread`} className={badgeBase}>
      <span>{variant === "mobile" ? "LD" : "Leads"}</span>
      {unreadCount > 0 && (
        <span className={variant === "mobile"
          ? "absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-bold leading-none text-white"
          : "flex h-6 min-w-6 items-center justify-center rounded-full bg-pink-600 px-2 text-xs font-bold leading-none text-white"}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
