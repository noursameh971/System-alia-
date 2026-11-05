"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarDays, Flame, Hourglass, Wallet } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { formatPrice } from "@/lib/formatPrice";
import { getCashIntelligence, getFinancialStatements, type CashIntelligence, type ContributionMargin } from "@/lib/statements";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { PeriodPicker, StatementTable, percent, rangeFor, type Period, type StatementRow } from "./FinancialStatements";

function runwayLabel(data: CashIntelligence, t: (key: string) => string): { value: string; sublabel: string } {
  if (data.runwayMonths === null) return { value: "∞", sublabel: t("Not burning cash") };
  if (data.runwayMonths <= 0) return { value: "0", sublabel: t("No cash left at the current burn") };
  return { value: `${data.runwayMonths.toFixed(1)} ${t("months")}`, sublabel: t("Cash ÷ monthly burn") };
}

function CashTrendTable({ months }: { months: CashIntelligence["monthly"] }) {
  const { t } = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
            <th className="pb-2 text-start">{t("Month")}</th>
            <th className="pb-2 text-end">{t("Cash in")}</th>
            <th className="pb-2 text-end">{t("Cash out")}</th>
            <th className="pb-2 text-end">{t("Net cash change")}</th>
            <th className="pb-2 text-end">{t("Net profit")}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {months.map((m) => (
            <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2 text-slate-900 dark:text-slate-100">
                {m.month}
                {m.partial ? <span className="ms-1.5 text-xs text-slate-400">({t("to date")})</span> : null}
              </td>
              <td className="py-2 text-end text-slate-700 dark:text-slate-300">{formatPrice(m.inflows)}</td>
              <td className="py-2 text-end text-slate-700 dark:text-slate-300">{formatPrice(m.outflows)}</td>
              <td
                className={cn(
                  "py-2 text-end font-medium",
                  m.netCash < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {formatPrice(m.netCash)}
              </td>
              <td className={cn("py-2 text-end", m.netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300")}>
                {formatPrice(m.netProfit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributionCard({ brandId }: { brandId: string }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<Period>("ytd");
  const range = rangeFor(period);
  // Same request/cache key as the statement tabs, so switching between them doesn't refetch.
  const { data, error, isLoading } = useSWR(["finance-statements", brandId, range.from, range.to], () =>
    getFinancialStatements(brandId, range),
  );
  const c: ContributionMargin | undefined = data?.incomeStatement.contribution;

  const rows: StatementRow[] = c
    ? [
        { label: "Total revenue", amount: c.revenue, kind: "subtotal" },
        { label: "Cost of sales", amount: c.revenue - c.afterCostOfSales, kind: "item" },
        { label: "After cost of sales", amount: c.afterCostOfSales, kind: "subtotal" },
        { label: "Fulfilment (shipping, packing, logistics)", amount: c.fulfilment, kind: "item" },
        { label: "After fulfilment", amount: c.afterFulfilment, kind: "subtotal" },
        { label: "Marketing & Ads", amount: c.marketing, kind: "item" },
        { label: "Contribution margin", amount: c.afterMarketing, kind: "subtotal" },
        { label: "Fixed costs (salaries, rent, fees, misc)", amount: c.fixedCosts, kind: "item" },
        { label: c.netProfit >= 0 ? "Net profit" : "Net loss", amount: c.netProfit, kind: "total" },
      ]
    : [];

  return (
    <DashboardCard title={t("Contribution margin")}>
      <div className="flex flex-col gap-4">
        <PeriodPicker period={period} onChange={setPeriod} />
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading..." />
          </div>
        ) : error ? (
          <EmptyState
            title={t("Couldn't load financial statements")}
            description={error instanceof ApiError ? error.message : t("Check that the backend API is running.")}
          />
        ) : c ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatTile
                variant="flat"
                label={t("Contribution margin ratio")}
                value={percent(c.contributionRatio)}
                sublabel={t("Left from each pound of sales for fixed costs")}
              />
              <StatTile
                variant="flat"
                label={t("Break-even revenue")}
                value={c.breakEvenRevenue === null ? "—" : formatPrice(Math.round(c.breakEvenRevenue))}
                sublabel={
                  c.breakEvenRevenue === null
                    ? t("No revenue level breaks even while contribution is negative")
                    : t("Revenue needed to cover fixed costs at this margin")
                }
              />
            </div>
            <StatementTable
              rows={rows}
              footnote="Costs are grouped by how they behave: variable costs first, then fixed overheads. Net profit is the same figure as the Income Statement."
            />
          </>
        ) : null}
      </div>
    </DashboardCard>
  );
}

/**
 * Virtual CFO overview: cash position, burn, runway and the monthly cash
 * trend, plus the contribution-margin breakdown. Read-only — everything
 * comes from GET /api/statements and /api/statements/insights.
 */
export function CfoOverview({ brandId }: { brandId: string }) {
  const { t } = useLocale();
  const { data, error, isLoading } = useSWR(["cfo-insights", brandId], () => getCashIntelligence(brandId));

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading..." />
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        title={t("Couldn't load financial statements")}
        description={error instanceof ApiError ? error.message : t("Check that the backend API is running.")}
      />
    );
  }

  const runway = runwayLabel(data, t);
  const growing = data.avgMonthlyNetCash >= 0;

  return (
    <div className="flex flex-col gap-5">
      {!data.startingBalancesSet ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("Cash position and runway use recorded entries only. Set starting cash & capital on the Balance Sheet tab for your real position.")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("Cash position")}
          value={formatPrice(data.currentCash)}
          sublabel={t("Starting cash + recorded flows")}
          icon={Wallet}
          iconColor={data.currentCash >= 0 ? "emerald" : "rose"}
        />
        <StatTile
          label={t(growing ? "Avg. monthly cash growth" : "Monthly burn")}
          value={formatPrice(growing ? data.avgMonthlyNetCash : data.monthlyBurn)}
          sublabel={
            data.burnWindowMonths > 0
              ? `${t("Average of the last")} ${data.burnWindowMonths} ${t(data.burnWindowMonths === 1 ? "complete month" : "complete months")}`
              : t("Not enough history yet")
          }
          icon={Flame}
          iconColor={growing ? "emerald" : "amber"}
        />
        <StatTile label={t("Runway")} value={runway.value} sublabel={runway.sublabel} icon={Hourglass} iconColor="blue" />
        <StatTile
          label={t("Net cash this month")}
          value={formatPrice(data.monthly[data.monthly.length - 1]?.netCash ?? 0)}
          sublabel={t("Month to date")}
          icon={CalendarDays}
          iconColor="indigo"
        />
      </div>

      <DashboardCard title={t("Monthly cash trend")}>
        <CashTrendTable months={data.monthly} />
      </DashboardCard>

      <ContributionCard brandId={brandId} />
    </div>
  );
}
