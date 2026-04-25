"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export type TabItem = { value: string; label: string };

/**
 * Sub-tab bar driven by a `?tab=` URL search param. Reads the current
 * value from useSearchParams so the active styling stays in sync with
 * the URL across client-side navigations.
 *
 * `defaultValue` is the tab assumed when ?tab is absent.
 */
export function TabBar({
  tabs,
  defaultValue,
}: {
  tabs: TabItem[];
  defaultValue: string;
}) {
  const params = useSearchParams();
  const current = params?.get("tab") ?? defaultValue;

  return (
    <div className="px-4 md:px-8 mt-3 flex gap-2 border-b border-gray-200">
      {tabs.map((t) => {
        const active = current === t.value;
        return (
          <Link
            key={t.value}
            href={"?tab=" + t.value}
            className={
              "px-4 py-2 text-sm border-b-2 " +
              (active ? "border-[color:var(--admin-primary)] text-[color:var(--admin-primary)] font-medium" : "border-transparent text-gray-500")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
