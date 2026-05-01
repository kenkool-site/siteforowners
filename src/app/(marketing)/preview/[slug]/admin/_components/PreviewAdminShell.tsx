"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

export type PreviewShellTenant = {
  business_name: string;
  checkout_mode?: string | null;
};

function buildTabs(tenant: PreviewShellTenant, prefix: string): Tab[] {
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: Tab[] = [{ href: `${prefix}`, label: "Home", icon: "⌂" }];
  tabs.push({ href: `${prefix}/schedule`, label: "Schedule", icon: "📅" });
  if (showOrders) tabs.push({ href: `${prefix}/orders`, label: "Orders", icon: "🛍" });
  tabs.push({ href: `${prefix}/services`, label: "Services", icon: "✂" });
  tabs.push({ href: `${prefix}/leads`, label: "Leads", icon: "✉" });
  return tabs;
}

export function PreviewAdminShell({
  tenant,
  pathPrefix,
  backHref,
  unreadCount = 0,
  children,
}: {
  tenant: PreviewShellTenant;
  pathPrefix: string;
  backHref: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const currentPath = usePathname() || pathPrefix;
  const tabs = buildTabs(tenant, pathPrefix);
  const primary = tabs.slice(0, 4);

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-48 bg-white border-r border-gray-200 p-4">
        <div className="mb-4">
          <div className="font-semibold text-sm mb-2">{tenant.business_name}</div>
          <Link
            href={backHref}
            className="block w-full text-center bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] hover:bg-[var(--admin-primary-hover)] border border-[color:var(--admin-primary-border)] rounded-lg py-2 text-sm font-medium"
          >
            ← Back to preview
          </Link>
          {unreadCount > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-semibold text-[color:var(--admin-primary)]">{unreadCount}</span>
              {" unread "}
              {unreadCount === 1 ? "lead" : "leads"}
            </div>
          )}
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
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col md:min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden bg-[var(--admin-primary)] text-white px-4 py-3 flex justify-between items-center gap-3">
          <div className="font-semibold text-sm truncate">{tenant.business_name}</div>
          <Link
            href={backHref}
            className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
          >
            ← Preview
          </Link>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
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
        </nav>
      </div>
    </div>
  );
}
