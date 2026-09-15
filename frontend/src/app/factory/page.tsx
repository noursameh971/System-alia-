"use client";

import useSWR from "swr";
import { AlertTriangle, Boxes, ClipboardList, PackageCheck, Trash2, Wallet } from "lucide-react";
import { getFactoryDashboard } from "@/lib/factory";
import { ApiError } from "@/lib/apiClient";
import { useLocale } from "@/context/LocaleContext";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatPrice } from "@/lib/formatPrice";

export default function FactoryDashboardPage() {
  const { t } = useLocale();
  const { data, error, isLoading } = useSWR("factory-dashboard", getFactoryDashboard);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading factory data..." />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load the factory dashboard"
        description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
      />
    );
  }

  if (!data) return null;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Factory performance at a glance")}</h2>
      {/* flex-wrap + flex-1: same reasoning as the Company Dashboard's KPI
          row — 6 tiles don't divide evenly into any fixed grid column
          count. */}
      <div className="mt-6 flex flex-wrap gap-4">
        <div className="min-w-[200px] flex-1">
          <StatTile variant="flat" label={t("Active work orders")} value={String(data.activeWorkOrders)} icon={ClipboardList} iconColor="indigo" />
        </div>
        <div className="min-w-[200px] flex-1">
          <StatTile
            variant="flat"
            label={t("Materials below reorder level")}
            value={String(data.materialsBelowReorder)}
            icon={AlertTriangle}
            iconColor="rose"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <StatTile
            variant="flat"
            label={t("Raw material inventory value")}
            value={formatPrice(data.rawMaterialInventoryValue)}
            icon={Wallet}
            iconColor="amber"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <StatTile variant="flat" label={t("Finished goods on hand")} value={String(data.finishedGoodsOnHand)} icon={Boxes} iconColor="blue" />
        </div>
        <div className="min-w-[200px] flex-1">
          <StatTile
            variant="flat"
            label={t("This month's good output")}
            value={String(data.monthGoodOutput)}
            icon={PackageCheck}
            iconColor="emerald"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <StatTile variant="flat" label={t("This month's scrap")} value={String(data.monthScrapOutput)} icon={Trash2} iconColor="violet" />
        </div>
      </div>
    </section>
  );
}
