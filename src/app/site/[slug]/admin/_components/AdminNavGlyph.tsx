import { ADMIN_NAV_ICON_PATHS, type AdminNavIconName } from "@/lib/admin-nav-icons";

export function AdminNavGlyph({ name, className = "" }: { name: AdminNavIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ADMIN_NAV_ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
