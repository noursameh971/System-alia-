"use client";

import { useLocale } from "@/context/LocaleContext";
import { EXPENSE_CATEGORY_META } from "@/lib/expenses";
import type { ExpenseCategory } from "@/lib/types";

/** Not the shared <Badge>: each expense category owns a fixed color that also drives the breakdown chart, so the palette lives in EXPENSE_CATEGORY_META rather than in Badge's generic variant list. */
export function ExpenseCategoryBadge({ category }: { category: ExpenseCategory }) {
  const { t } = useLocale();
  const meta = EXPENSE_CATEGORY_META[category];

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
    >
      {t(meta.label)}
    </span>
  );
}
