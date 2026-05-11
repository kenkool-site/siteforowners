"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { groupServices } from "./groupServices";

/**
 * Category headers in service sections: when `defaultCategoriesCollapsed` is true,
 * each group starts collapsed; user taps to expand. When false, historic behavior
 * (all groups expanded) is preserved.
 */
export function useServiceCategoryCollapse(
  services: ServiceItem[],
  categories: string[] | undefined,
  defaultCategoriesCollapsed: boolean | undefined,
) {
  const groups = useMemo(() => groupServices(services, categories), [services, categories]);

  const groupLabelsKey = useMemo(
    () => groups.map((g) => g.label ?? "").join("\0"),
    [groups],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useLayoutEffect(() => {
    if (!defaultCategoriesCollapsed) {
      setCollapsed({});
      return;
    }
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (g.label && next[g.label] === undefined) {
          next[g.label] = true;
        }
      }
      return next;
    });
  }, [defaultCategoriesCollapsed, groupLabelsKey, groups]);

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  return { groups, collapsed, toggle };
}
