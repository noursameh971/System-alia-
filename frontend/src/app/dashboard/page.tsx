"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Building2, DollarSign, Package, PiggyBank, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { getDashboardSummary } from "@/lib/dashboard";
import { WORKSPACE_PICKER, landingPathFor } from "@/lib/routing";
import { ApiError } from "@/lib/apiClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CARD_TITLE_CLASS } from "@/components/dashboard/DashboardCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { BrandComparison } from "@/components/dashboard/BrandComparison";
import { RecentMovementsList } from "@/components/dashboard/RecentMovementsList";
import { BrandComparisonChart } from "@/components/dashboard/charts/BrandComparisonChart";
import { FinancialBreakdownChart } from "@/components/dashboard/charts/FinancialBreakdownChart";
import { formatPrice } from "@/lib/formatPrice";

export default function DashboardPage() {
  const router = useRouter();
  const { role, brandCode, isLoading: isSessionLoading } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";

  const { data, error, isLoading } = useSWR(isAdmin ? "dashboard-summary" : null, getDashboardSummary);

  useEffect(() => {
    if (!isSessionLoading && role && !isAdmin) router.replace(landingPathFor(role, brandCode));
  }, [isSessionLoading, isAdmin, role, brandCode, router]);

  if (isSessionLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.14),_transparent_28%),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-slate-900">{t("Executive dashboard")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={WORKSPACE_PICKER}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {t("Workspaces")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading company data..." />
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load the dashboard"
            description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
          />
        ) : !data ? null : (
          <>
            <section className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Company performance at a glance")}</h2>
                <div className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {data.activeBrandCount} {t(data.activeBrandCount === 1 ? "active workspace" : "active workspaces")}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatTile variant="flat" label={t("Combined inventory value")} value={formatPrice(data.totals.inventoryValue)} icon={Wallet} iconColor="indigo" />
                <StatTile variant="flat" label={t("Total items in stock")} value={String(data.totals.inventoryUnitCount)} icon={Package} iconColor="blue" />
                <StatTile variant="flat" label={t("Active brands")} value={String(data.activeBrandCount)} icon={Building2} iconColor="amber" />
                <StatTile variant="flat" label={t("Total revenue")} value={formatPrice(data.totals.revenue)} icon={TrendingUp} iconColor="emerald" />
                <StatTile variant="flat" label={t("Orders")} value={String(data.totals.orderCount)} icon={ShoppingCart} iconColor="violet" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm">
              <h2 className={CARD_TITLE_CLASS}>{t("Financial Overview")}</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile variant="flat" label={t("Total Revenue")} value={formatPrice(data.totals.revenue)} icon={DollarSign} iconColor="emerald" />
                <StatTile
                  variant="flat"
                  label={t("Total Expenses")}
                  value={formatPrice(data.totals.totalExpenses)}
                  sublabel={t("Production cost + shipping")}
                  icon={Receipt}
                  iconColor="rose"
                />
                <StatTile
                  variant="flat"
                  label={t("Net Profit")}
                  value={formatPrice(data.totals.netProfit)}
                  sublabel={`${data.totals.profitMargin.toFixed(1)}% ${t("margin")}`}
                  icon={PiggyBank}
                  iconColor="violet"
                />
              </div>
              <div className="mt-5">
                <FinancialBreakdownChart
                  data={data.brands.map((b) => ({ name: b.name, revenue: b.revenue, expenses: b.totalExpenses, netProfit: b.netProfit }))}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm">
              <h3 className={CARD_TITLE_CLASS}>{t("Revenue & inventory value by brand")}</h3>
              <div className="mt-4">
                <BrandComparisonChart brands={data.brands} />
              </div>
            </section>

            {/* items-stretch (grid's default, but stated explicitly because
                the row above deliberately uses items-start) is what makes the
                Brand Performance column grow to meet the capped Recent
                Activity card instead of ending short of it. */}
            <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className={`mb-3 ${CARD_TITLE_CLASS}`}>{t("By brand")}</h3>
                <BrandComparison brands={data.brands} />
              </div>

              <div className="flex min-w-0 flex-col">
                <h3 className={`mb-3 ${CARD_TITLE_CLASS}`}>{t("Recent activity")}</h3>
                <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  {/* pe-2, not pr-2: the gutter has to sit on the scrollbar's
                      side, which is the left edge in Arabic. */}
                  <div className="max-h-[380px] overflow-y-auto pe-2">
                    <RecentMovementsList movements={data.recentMovements} />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
