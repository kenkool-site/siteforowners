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
    "bg-white border border-warm-cream1 rounded-[1.35rem] p-4 shadow-sm " +
    (fullWidth ? "col-span-2 md:col-span-4 " : "") +
    (href ? "hover:border-pink-200 hover:bg-pink-50/40 transition-colors cursor-pointer block" : "");

  const inner = (
    <>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-warm-textMuted">{label}</div>
      <div className="mt-4 text-3xl font-black leading-none text-pop-pink md:text-4xl">{value}</div>
      <div className="mt-1 text-xs font-semibold text-warm-textMuted">
        {href ? "Tap to review" : "Updated today"}
      </div>
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
