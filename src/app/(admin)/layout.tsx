import Link from "next/link";

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
            <Link href="/prospects" className="text-lg font-bold text-gray-900">
              Site<span className="text-amber-600">ForOwners</span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
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
