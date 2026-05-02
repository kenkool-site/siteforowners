import Link from "next/link";
import { MarketingBrandLogo } from "@/components/MarketingBrandLogo";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/prospects"
              className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2"
            >
              <MarketingBrandLogo heightClass="h-8" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Admin
              </span>
            </Link>
            <nav className="hidden items-center gap-4 sm:flex">
              <Link
                href="/prospects"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Prospects
              </Link>
              <Link
                href="/clients"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Clients
              </Link>
              <Link
                href="/previews"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Previews
              </Link>
            </nav>
          </div>
          <Link
            href="/preview"
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + New Preview
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
