export function StatCard({ value, label, fullWidth = false }: {
  value: number | string;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={
        "bg-white border border-gray-200 rounded-lg p-4 " +
        (fullWidth ? "col-span-2 md:col-span-4" : "")
      }
    >
      <div className="text-2xl md:text-3xl font-bold text-[color:var(--admin-primary)]">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  );
}
