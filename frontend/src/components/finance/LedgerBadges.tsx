"use client";

import { useLocale } from "@/context/LocaleContext";
import { LEDGER_BALANCE_TYPE_META, LEDGER_CATEGORY_META } from "@/lib/ledger";
import type { LedgerBalanceType, LedgerEntityCategory } from "@/lib/types";

/** Not the shared <Badge>: each category/type owns a fixed color, same pattern as ExpenseCategoryBadge. */
export function LedgerCategoryBadge({ category }: { category: LedgerEntityCategory }) {
  const { t } = useLocale();
  const meta = LEDGER_CATEGORY_META[category];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
      {t(meta.label)}
    </span>
  );
}

export function LedgerBalanceTypeBadge({ balanceType }: { balanceType: LedgerBalanceType }) {
  const { t } = useLocale();
  const meta = LEDGER_BALANCE_TYPE_META[balanceType];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
      {t(meta.label)}
    </span>
  );
}
