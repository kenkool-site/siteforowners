"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminNavIconName, type AdminNavIconName } from "@/lib/admin-nav-icons";
import { SignOutButton } from "./SignOutButton";
import { LeadsBadge } from "./LeadsBadge";
import { AdminNavGlyph } from "./AdminNavGlyph";

type Tab = { href: string; label: string; icon: AdminNavIconName };

export type ShellTenant = {
  business_name: string;
  booking_tool?: string | null;
  checkout_mode?: string | null;
};

function buildTabs(tenant: ShellTenant): Tab[] {
  const showSchedule = !tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: Tab[] = [{ href: "/admin", label: "Home", icon: getAdminNavIconName("Home") }];
  if (showSchedule) tabs.push({ href: "/admin/schedule", label: "Schedule", icon: getAdminNavIconName("Schedule") });
  if (showSchedule) tabs.push({ href: "/admin/services", label: "Services", icon: getAdminNavIconName("Services") });
  if (showOrders) tabs.push({ href: "/admin/orders", label: "Orders", icon: getAdminNavIconName("Orders") });
  tabs.push({ href: "/admin/updates", label: "Updates", icon: getAdminNavIconName("Updates") });
  // Leads demoted to overflow (page still exists; the LeadsBadge in the
  // top bar / sidebar header is the primary entry now).
  tabs.push({ href: "/admin/leads", label: "Leads", icon: getAdminNavIconName("Leads") });
  tabs.push({ href: "/admin/billing", label: "Billing", icon: getAdminNavIconName("Billing") });
  tabs.push({ href: "/admin/settings", label: "Settings", icon: getAdminNavIconName("Settings") });
  return tabs;
}

export function AdminShell({
  tenant,
  unreadCount = 0,
  children,
}: {
  tenant: ShellTenant;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const currentPath = usePathname() || "/admin";
  const tabs = buildTabs(tenant);
  const primary = tabs.slice(0, 4);
  const overflow = tabs.slice(4);

  return (
    <div className="min-h-screen bg-warm-cream2 text-warm-deep md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-warm-cream1 bg-[#fffaf2] p-4 md:flex">
        <div className="rounded-[1.5rem] bg-warm-deep p-4 text-pop-cream">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-pink">Owner admin</p>
          <div className="mt-2 text-lg font-black leading-tight">{tenant.business_name}</div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-full bg-pop-cream px-4 py-2 text-xs font-black text-warm-deep transition hover:bg-white"
          >
            View site
          </a>
        </div>
        <div className="mt-3">
          <LeadsBadge unreadCount={unreadCount} variant="desktop" />
        </div>
        <nav className="mt-4 flex flex-col gap-1.5">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-black transition " +
                (currentPath === t.href
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-100"
                  : "text-warm-textMuted hover:bg-white")
              }
            >
              <span className={
                "grid h-8 w-8 place-items-center rounded-xl " +
                (currentPath === t.href ? "bg-white text-pop-pink" : "bg-warm-cream2 text-warm-textMuted")
              }>
                <AdminNavGlyph name={t.icon} className="h-4 w-4" />
              </span>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-warm-cream1 pt-4">
          <SignOutButton className="text-sm font-bold text-warm-textMuted hover:text-warm-deep" />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col md:min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-warm-cream1 bg-[#fffaf2]/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-warm-deep">{tenant.business_name}</div>
            <div className="text-[11px] font-bold text-warm-textMuted">Owner admin</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-warm-deep px-3 py-2 text-xs font-black text-pop-cream"
            >
              View
            </a>
            <LeadsBadge unreadCount={unreadCount} variant="mobile" />
            <SignOutButton className="text-xs font-bold text-warm-textMuted" />
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav — each item gets a 56px-tall touch target
            (Apple HIG recommends ≥44pt) and a larger icon for visibility.
            touch-manipulation eliminates the ~300ms double-tap-zoom delay
            mobile browsers add by default; active:bg-* gives an instant
            press flash so the customer doesn't wait for navigation to
            confirm their tap registered. */}
        <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.5rem] border border-warm-cream1 bg-white/95 p-2 text-xs shadow-2xl backdrop-blur md:hidden">
          {primary.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              className={
                "flex min-h-[50px] select-none flex-col items-center justify-center rounded-2xl py-1 touch-manipulation transition-colors active:bg-warm-cream2 " +
                (currentPath === t.href ? "bg-pink-50 text-pink-700" : "text-warm-textMuted")
              }
            >
              <span className={
                "grid h-8 w-8 place-items-center rounded-xl " +
                (currentPath === t.href ? "bg-pink-100 text-pop-pink ring-1 ring-pink-200" : "bg-warm-cream2 text-warm-textMuted")
              }>
                <AdminNavGlyph name={t.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-1 text-[11px] leading-none">{t.label}</span>
            </Link>
          ))}
          {overflow.length > 0 && (
            <details className="relative text-warm-textMuted">
              <summary className="flex min-h-[50px] cursor-pointer select-none flex-col items-center justify-center rounded-2xl py-1 touch-manipulation transition-colors active:bg-warm-cream2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-warm-cream2">
                  <AdminNavGlyph name="more" className="h-[18px] w-[18px]" />
                </span>
                <span className="mt-1 text-[11px] leading-none">More</span>
              </summary>
              <div className="absolute bottom-full right-0 mb-3 min-w-44 rounded-2xl border border-warm-cream1 bg-white py-1 shadow-2xl">
                {overflow.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    prefetch
                    className={
                      "block px-4 py-3 text-sm font-bold select-none touch-manipulation transition-colors active:bg-warm-cream2 " +
                      (currentPath === t.href ? "bg-pink-50 text-pink-700" : "text-warm-textMuted")
                    }
                  >
                    <AdminNavGlyph name={t.icon} className="mr-2 inline h-4 w-4 align-[-3px]" />
                    {t.label}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </div>
    </div>
  );
}
