import Link from "next/link";

export function LeadsBadge({ unreadCount, variant }: { unreadCount: number; variant: "mobile" | "desktop" }) {
  const badgeBase =
    variant === "mobile"
      ? "relative inline-flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full h-11 w-11 text-base"
      : "relative inline-flex items-center justify-center hover:bg-gray-100 rounded-md h-9 w-full text-base";
  return (
    <Link href="/admin/leads" aria-label={`Leads — ${unreadCount} unread`} className={badgeBase}>
      <span>✉</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold leading-none rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
