"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

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
  tabs.push({ href: "/admin/leads", label: "Leads", icon: "✉" });
  tabs.push({ href: "/admin/updates", label: "Updates", icon: "✏" });
  tabs.push({ href: "/admin/billing", label: "Billing", icon: "💳" });
  tabs.push({ href: "/admin/settings", label: "Settings", icon: "⚙" });
  return tabs;
}

export function AdminShell({
  tenant,
  children,
}: {
  tenant: ShellTenant;
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
            className="block w-full text-center bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200 rounded-lg py-2 text-sm font-medium"
          >
            View site ↗
          </a>
        </div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "text-sm px-3 py-2 rounded " +
                (currentPath === t.href
                  ? "bg-pink-50 text-pink-700 font-medium"
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
        <header className="md:hidden bg-pink-600 text-white px-4 py-3 flex justify-between items-center gap-3">
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
            <SignOutButton className="text-xs opacity-90" />
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 py-2 flex justify-around text-xs">
          {primary.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "flex flex-col items-center " +
                (currentPath === t.href ? "text-pink-600" : "text-gray-500")
              }
            >
              <span className="text-base">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </Link>
          ))}
          {overflow.length > 0 && (
            <details className="flex flex-col items-center text-gray-500 relative">
              <summary className="list-none cursor-pointer text-center">
                <span className="text-base">⋯</span>
                <span className="block mt-0.5">More</span>
              </summary>
              <div className="absolute bottom-full right-2 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-40">
                {overflow.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={
                      "block px-4 py-2 text-sm " +
                      (currentPath === t.href ? "text-pink-600 bg-pink-50" : "text-gray-700")
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
