import Link from "next/link";

export function StatCard({
  value,
  label,
  fullWidth = false,
  href,
}: {
  value: number | string;
  label: string;
  fullWidth?: boolean;
  href?: string;
}) {
  const className =
    "bg-white border border-gray-200 rounded-lg p-4 " +
    (fullWidth ? "col-span-2 md:col-span-4 " : "") +
    (href ? "hover:border-gray-300 transition-colors cursor-pointer block" : "");

  const inner = (
    <>
      <div className="text-2xl md:text-3xl font-bold text-[color:var(--admin-primary)]">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} prefetch={false}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
