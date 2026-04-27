"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { LeadsBadge } from "./LeadsBadge";

type Tab = { href: string; label: string; icon: string };

export type ShellTenant = {
  business_name: string;
  booking_tool?: string | null;
  checkout_mode?: string | null;
};

function buildTabs(tenant: ShellTenant): Tab[] {
  const showSchedule = !tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: Tab[] = [{ href: "/admin", label: "Home", icon: "⌂" }];
  if (showSchedule) tabs.push({ href: "/admin/schedule", label: "Schedule", icon: "📅" });
  if (showOrders) tabs.push({ href: "/admin/orders", label: "Orders", icon: "🛍" });
  // Spec 3: Services replaces Leads in primary slots.
  if (showSchedule) tabs.push({ href: "/admin/services", label: "Services", icon: "✂" });
  tabs.push({ href: "/admin/updates", label: "Updates", icon: "✏" });
  // Leads demoted to overflow (page still exists; the LeadsBadge in the
  // top bar / sidebar header is the primary entry now).
  tabs.push({ href: "/admin/leads", label: "Leads", icon: "✉" });
  tabs.push({ href: "/admin/billing", label: "Billing", icon: "💳" });
  tabs.push({ href: "/admin/settings", label: "Settings", icon: "⚙" });
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
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-48 bg-white border-r border-gray-200 p-4">
        <div className="mb-4">
          <div className="font-semibold text-sm mb-2">{tenant.business_name}</div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] hover:bg-[var(--admin-primary-hover)] border border-[color:var(--admin-primary-border)] rounded-lg py-2 text-sm font-medium"
          >
            View site ↗
          </a>
          <div className="mt-2">
            <LeadsBadge unreadCount={unreadCount} variant="desktop" />
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "text-sm px-3 py-2 rounded " +
                (currentPath === t.href
                  ? "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] font-medium"
                  : "text-gray-700 hover:bg-gray-100")
              }
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 pt-4 border-t border-gray-200">
          <SignOutButton className="text-sm text-gray-500 hover:text-gray-900" />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col md:min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden bg-[var(--admin-primary)] text-white px-4 py-3 flex justify-between items-center gap-3">
          <div className="font-semibold text-sm truncate">{tenant.business_name}</div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-medium"
            >
              View site ↗
            </a>
            <LeadsBadge unreadCount={unreadCount} variant="mobile" />
            <SignOutButton className="text-xs opacity-90" />
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav — each item gets a 56px-tall touch target
            (Apple HIG recommends ≥44pt) and a larger icon for visibility.
            touch-manipulation eliminates the ~300ms double-tap-zoom delay
            mobile browsers add by default; active:bg-* gives an instant
            press flash so the customer doesn't wait for navigation to
            confirm their tap registered. */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex justify-around text-xs pb-[env(safe-area-inset-bottom)]">
          {primary.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              className={
                "flex flex-col items-center justify-center flex-1 min-h-[56px] py-1 select-none touch-manipulation transition-colors active:bg-gray-100 " +
                (currentPath === t.href ? "text-[color:var(--admin-primary)]" : "text-gray-500")
              }
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="mt-1 text-[11px] leading-none">{t.label}</span>
            </Link>
          ))}
          {overflow.length > 0 && (
            <details className="flex-1 relative text-gray-500">
              <summary className="list-none cursor-pointer flex flex-col items-center justify-center min-h-[56px] py-1 select-none touch-manipulation transition-colors active:bg-gray-100">
                <span className="text-xl leading-none">⋯</span>
                <span className="mt-1 text-[11px] leading-none">More</span>
              </summary>
              <div className="absolute bottom-full right-2 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-44">
                {overflow.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    prefetch
                    className={
                      "block px-4 py-3 text-sm select-none touch-manipulation transition-colors active:bg-gray-100 " +
                      (currentPath === t.href ? "text-[color:var(--admin-primary)] bg-[var(--admin-primary-light)]" : "text-gray-700")
                    }
                  >
                    <span className="mr-2">{t.icon}</span>
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
