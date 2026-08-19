"use client";

import { useState } from "react";
import useSWR from "swr";
import { DollarSign, Package, PiggyBank, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { getBrandDashboardSummary } from "@/lib/dashboard";
import { ApiError } from "@/lib/apiClient";
import { formatPrice } from "@/lib/formatPrice";
import type { LowStockItem } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CARD_TITLE_CLASS, DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { TopSellingList } from "@/components/dashboard/TopSellingList";
import { LowStockList } from "@/components/dashboard/LowStockList";
import { BrandActivityList } from "@/components/dashboard/BrandActivityList";
import { QuickRestockModal } from "@/components/dashboard/QuickRestockModal";
import { RankedBarChart } from "@/components/dashboard/charts/RankedBarChart";
import { CategoryDonutChart } from "@/components/dashboard/charts/CategoryDonutChart";
import { FinancialBreakdownChart } from "@/components/dashboard/charts/FinancialBreakdownChart";

/**
 * Height cap for the two unbounded list widgets. Both the low-stock
 * warnings and the top-sellers list come back from the API with no limit,
 * and letting them size to their content is what stretched the page far
 * past the fold. Capping the *body* (not the card) keeps the card chrome
 * fixed and moves the overflow into a local scroll area.
 *
 * pe-1 rather than pr-1 so the gutter that keeps rows off the scrollbar
 * follows the reading direction — it belongs on the left in Arabic.
 */
const SCROLL_LIST = "max-h-[360px] overflow-y-auto pe-1";

export default function BrandDashboardPage() {
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";
  const { data, error, isLoading, mutate } = useSWR(["brand-dashboard", brand.id], () => getBrandDashboardSummary(brand.id));
  const [restockItem, setRestockItem] = useState<LowStockItem | null>(null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t("Dashboard")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {brand.name} — {t("inventory and sales at a glance")}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading dashboard..." />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load the dashboard"
          description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
        />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t("Inventory value")}
              value={formatPrice(data.inventoryValue)}
              sublabel={t("vs 7 days ago")}
              icon={Wallet}
              iconColor="indigo"
              trendData={data.trend.map((point) => point.inventoryValue)}
            />
            <StatTile
              label={t("Units in stock")}
              value={String(data.inventoryUnitCount)}
              sublabel={t("vs 7 days ago")}
              icon={Package}
              iconColor="blue"
              trendData={data.trend.map((point) => point.inventoryUnits)}
            />
            <StatTile
              label={t("Revenue")}
              value={formatPrice(data.revenue)}
              sublabel={t("last 7 days")}
              icon={TrendingUp}
              iconColor="emerald"
              trendData={data.trend.map((point) => point.revenue)}
            />
            <StatTile
              label={t("Orders")}
              value={String(data.orderCount)}
              sublabel={t("last 7 days")}
              icon={ShoppingCart}
              iconColor="violet"
              trendData={data.trend.map((point) => point.orderCount)}
            />
          </div>

          {isAdmin ? (
            <DashboardCard title={t("Financial Overview")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  variant="flat"
                  label={t("Total Revenue")}
                  value={formatPrice(data.revenue)}
                  icon={DollarSign}
                  iconColor="emerald"
                />
                <StatTile
                  variant="flat"
                  label={t("Total Expenses")}
                  value={formatPrice(data.totalExpenses)}
                  sublabel={t("Production cost + shipping")}
                  icon={Receipt}
                  iconColor="rose"
                />
                <StatTile
                  variant="flat"
                  label={t("Net Profit")}
                  value={formatPrice(data.netProfit)}
                  sublabel={`${data.profitMargin.toFixed(1)}% ${t("margin")}`}
                  icon={PiggyBank}
                  iconColor="violet"
                />
              </div>
              <div className="mt-4 min-w-0">
                <FinancialBreakdownChart
                  data={data.trend.map((point) => ({
                    name: new Date(point.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    revenue: point.revenue,
                    expenses: point.expenses,
                    netProfit: point.netProfit,
                  }))}
                />
              </div>
            </DashboardCard>
          ) : null}

          {/* items-start throughout: without it CSS Grid stretches every card
              in a row to the tallest one, which re-introduces exactly the
              dead vertical space the height caps exist to remove. */}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <DashboardCard title={t("Inventory distribution by category")}>
              <CategoryDonutChart items={data.categoryBreakdown} />
            </DashboardCard>

            <DashboardCard title={t("Top stocked variants")}>
              {data.topStockedItems.length > 0 ? (
                <RankedBarChart
                  items={data.topStockedItems.map((item) => ({
                    key: item.variantId,
                    name: `${item.productName} (${[item.color, item.size].filter(Boolean).join("/")})`,
                    value: item.stock,
                  }))}
                  seriesLabel={t("On hand")}
                  valueSuffix={t("units")}
                  color="#059669"
                />
              ) : (
                <EmptyState title={t("No stock yet")} description={t("Stocked variants will show up here.")} />
              )}
            </DashboardCard>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <DashboardCard
              title={t("Top selling items")}
              action={
                data.topSellingItems.length > 0 ? (
                  <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {data.topSellingItems.length}
                  </span>
                ) : null
              }
              bodyClassName={SCROLL_LIST}
            >
              <TopSellingList items={data.topSellingItems} />
            </DashboardCard>

            <DashboardCard
              title={t("Low stock warnings")}
              action={
                data.lowStockItems.length > 0 ? (
                  <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {data.lowStockItems.length}
                  </span>
                ) : null
              }
              bodyClassName={SCROLL_LIST}
            >
              <LowStockList items={data.lowStockItems} onRestock={setRestockItem} />
            </DashboardCard>
          </div>

          {data.topSellingItems.length > 0 ? (
            <DashboardCard title={t("Units sold by variant")}>
              <RankedBarChart
                items={data.topSellingItems.map((item) => ({
                  key: item.variantId,
                  name: item.productName,
                  value: item.quantitySold,
                }))}
                seriesLabel={t("Sold")}
                valueSuffix={t("units")}
                color="#4f46e5"
              />
            </DashboardCard>
          ) : null}

          {/* Not a DashboardCard: BrandActivityList already renders its own
              bordered table shell, and wrapping it would double the border. */}
          <div className="min-w-0">
            <h2 className={`mb-3 ${CARD_TITLE_CLASS}`}>{t("Recent activity")}</h2>
            <BrandActivityList movements={data.recentMovements} />
          </div>
        </>
      )}

      <QuickRestockModal item={restockItem} onOpenChange={(open) => !open && setRestockItem(null)} onSuccess={() => void mutate()} />
    </div>
  );
}
