"use client";

import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { CFO_ENABLED } from "@/lib/features";
import { workspaceHomePath } from "@/lib/routing";
import { Spinner } from "@/components/ui/Spinner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CfoOverview } from "@/components/cfo/CfoOverview";
import { FinancialStatements, type StatementView } from "@/components/cfo/FinancialStatements";

type CfoView = "overview" | StatementView;

const VIEWS: { value: CfoView; label: string }[] = [
  { value: "overview", label: "CFO Overview" },
  { value: "income", label: "Income Statement" },
  { value: "balance", label: "Balance Sheet" },
  { value: "cashflow", label: "Cash Flow" },
];

/**
 * Virtual CFO — a standalone, optional module (toggle: CFO_ENABLED in
 * lib/features.ts). Read-only analysis over the finance, order and
 * inventory data; the only thing it writes is its own starting cash &
 * capital row. Same access rule as the Finance page: admin and finance.
 */
export default function CfoPage() {
  const router = useRouter();
  const { brand } = useWorkspace();
  const { role, isLoading: isSessionLoading } = useCurrentUser();
  const { t } = useLocale();
  const [view, setView] = useState<CfoView>("overview");
  const canAccess = role === "admin" || role === "finance";

  useEffect(() => {
    if (!isSessionLoading && !canAccess) router.replace(workspaceHomePath(brand.code));
  }, [isSessionLoading, canAccess, brand.code, router]);

  if (!CFO_ENABLED) notFound();

  if (isSessionLoading || !canAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t("Virtual CFO")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {brand.name} — {t("cash intelligence and financial statements")}
        </p>
      </div>

      <SegmentedControl
        ariaLabel={t("Virtual CFO view")}
        options={VIEWS.map((option) => ({ value: option.value, label: t(option.label) }))}
        value={view}
        onChange={setView}
      />

      {view === "overview" ? <CfoOverview brandId={brand.id} /> : <FinancialStatements brandId={brand.id} view={view} />}
    </div>
  );
}
