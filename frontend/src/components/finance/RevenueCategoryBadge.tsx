"use client";

import { useLocale } from "@/context/LocaleContext";
import { REVENUE_CATEGORY_META } from "@/lib/revenues";
import type { RevenueCategory } from "@/lib/types";

/** Not the shared <Badge>: each revenue category owns a fixed color, same convention as ExpenseCategoryBadge — see REVENUE_CATEGORY_META. */
export function RevenueCategoryBadge({ category }: { category: RevenueCategory }) {
  const { t } = useLocale();
  const meta = REVENUE_CATEGORY_META[category];

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
    >
      {t(meta.label)}
    </span>
  );
}
