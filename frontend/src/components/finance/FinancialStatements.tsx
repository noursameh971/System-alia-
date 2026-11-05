"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Landmark,
  Percent,
  PiggyBank,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { EXPENSE_CATEGORY_META } from "@/lib/expenses";
import { formatPrice } from "@/lib/formatPrice";
import { REVENUE_CATEGORY_META } from "@/lib/revenues";
import { getFinancialStatements, type FinancialStatements as Statements } from "@/lib/statements";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatTile } from "@/components/dashboard/StatTile";

export type StatementView = "income" | "balance" | "cashflow";

type Period = "this_month" | "last_month" | "ytd" | "last_12_months" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "ytd", label: "Year to date" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

/** Local calendar day as YYYY-MM-DD — the backend compares against Cairo calendar days. */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rangeFor(period: Period): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this_month":
      return { from: isoDay(new Date(y, m, 1)), to: isoDay(now) };
    case "last_month":
      return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) };
    case "ytd":
      return { from: isoDay(new Date(y, 0, 1)), to: isoDay(now) };
    case "last_12_months":
      return { from: isoDay(new Date(y, m - 11, 1)), to: isoDay(now) };
    case "all":
      return {};
  }
}

const percent = (value: number) => `${value.toFixed(1)}%`;

interface StatementRow {
  label: string;
  amount: number;
  /** section: a heading with no amount. item: an indented detail line. subtotal / total: summary lines. */
  kind: "section" | "item" | "subtotal" | "total";
  /** Detail lines that are zero for this period are hidden to keep the statement readable. */
  hideIfZero?: boolean;
}

function StatementTable({ rows, footnote }: { rows: StatementRow[]; footnote?: string }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <tbody>
          {rows
            .filter((row) => !(row.hideIfZero && row.amount === 0))
            .map((row, index) =>
              row.kind === "section" ? (
                <tr key={index}>
                  <td
                    colSpan={2}
                    className="pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase first:pt-0 dark:text-slate-400"
                  >
                    {t(row.label)}
                  </td>
                </tr>
              ) : (
                <tr
                  key={index}
                  className={cn(
                    row.kind === "subtotal" && "border-t border-slate-200 font-semibold dark:border-slate-800",
                    row.kind === "total" && "border-t-2 border-double border-slate-300 text-base font-bold dark:border-slate-700",
                  )}
                >
                  <td
                    className={cn(
                      "py-2",
                      row.kind === "item" ? "ps-4 text-slate-600 dark:text-slate-400" : "text-slate-900 dark:text-slate-100",
                    )}
                  >
                    {t(row.label)}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-end whitespace-nowrap tabular-nums",
                      row.kind === "item" ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-slate-100",
                      row.kind !== "item" && row.amount < 0 && "text-red-600 dark:text-red-400",
                    )}
                  >
                    {formatPrice(row.amount)}
                  </td>
                </tr>
              ),
            )}
        </tbody>
      </table>
      {footnote ? <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">{t(footnote)}</p> : null}
    </div>
  );
}

function StatusBadge({ good, goodLabel, badLabel }: { good: boolean; goodLabel: string; badLabel: string }) {
  const { t } = useLocale();
  return <Badge variant={good ? "success" : "danger"}>{t(good ? goodLabel : badLabel)}</Badge>;
}

function IncomeStatementView({ data }: { data: Statements["incomeStatement"] }) {
  const { t } = useLocale();
  const profitable = data.netProfit >= 0;
  const rows: StatementRow[] = [
    { label: "Revenue", amount: 0, kind: "section" },
    { label: "Order sales", amount: data.orderRevenue, kind: "item" },
    ...Object.entries(data.otherRevenue).map(([category, amount]) => ({
      label: REVENUE_CATEGORY_META[category as keyof typeof REVENUE_CATEGORY_META].label,
      amount,
      kind: "item" as const,
      hideIfZero: true,
    })),
    { label: "Total revenue", amount: data.totalRevenue, kind: "subtotal" },
    { label: "Cost of sales", amount: 0, kind: "section" },
    { label: "Product cost of orders sold (COGS)", amount: data.costOfSales.orderCogs, kind: "item" },
    { label: "Production & fabric expenses", amount: data.costOfSales.productionExpenses, kind: "item" },
    { label: "Total cost of sales", amount: data.costOfSales.total, kind: "subtotal" },
    { label: "Gross profit", amount: data.grossProfit, kind: "subtotal" },
    { label: "Operating expenses", amount: 0, kind: "section" },
    { label: "Order shipping", amount: data.shipping, kind: "item", hideIfZero: true },
    ...Object.entries(data.operatingExpensesByCategory).map(([category, amount]) => ({
      label: EXPENSE_CATEGORY_META[category as keyof typeof EXPENSE_CATEGORY_META].label,
      amount,
      kind: "item" as const,
      hideIfZero: true,
    })),
    { label: "Total operating expenses", amount: data.totalOperatingExpenses, kind: "subtotal" },
    { label: profitable ? "Net profit" : "Net loss", amount: data.netProfit, kind: "total" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Total revenue")} value={formatPrice(data.totalRevenue)} icon={TrendingUp} iconColor="emerald" />
        <StatTile
          label={t("Gross profit")}
          value={formatPrice(data.grossProfit)}
          sublabel={`${t("Gross margin")} ${percent(data.grossMargin)}`}
          icon={Scale}
          iconColor="blue"
        />
        <StatTile
          label={t(profitable ? "Net profit" : "Net loss")}
          value={formatPrice(data.netProfit)}
          sublabel={t(profitable ? "Profitable" : "Loss-making")}
          icon={PiggyBank}
          iconColor={profitable ? "emerald" : "rose"}
        />
        <StatTile label={t("Net margin")} value={percent(data.netMargin)} sublabel={t("Net profit ÷ revenue")} icon={Percent} iconColor="indigo" />
      </div>
      <DashboardCard
        title={t("Income Statement")}
        action={<StatusBadge good={profitable} goodLabel="Profitable" badLabel="Loss-making" />}
      >
        <StatementTable
          rows={rows}
          footnote="Net profit matches the Overview tab. Production & fabric expenses are shown under cost of sales instead of operating expenses."
        />
      </DashboardCard>
    </>
  );
}

function CashFlowView({ data }: { data: Statements["cashFlow"] }) {
  const { t } = useLocale();
  const positive = data.netCashChange >= 0;
  const rows: StatementRow[] = [
    { label: "Cash inflows", amount: 0, kind: "section" },
    { label: "Collected order sales", amount: data.inflows.collectedOrderSales, kind: "item" },
    { label: "Recorded revenue", amount: data.inflows.recordedRevenue, kind: "item" },
    { label: "Collections from receivables", amount: data.inflows.receivableCollections, kind: "item" },
    { label: "Total inflows", amount: data.inflows.total, kind: "subtotal" },
    { label: "Cash outflows", amount: 0, kind: "section" },
    { label: "Expenses paid", amount: data.outflows.expensesPaid, kind: "item" },
    { label: "Supplier payments (not recorded as expenses)", amount: data.outflows.supplierPaymentsNotInExpenses, kind: "item" },
    { label: "Shipping on collected orders", amount: data.outflows.shippingOnCollectedOrders, kind: "item" },
    { label: "Total outflows", amount: data.outflows.total, kind: "subtotal" },
    { label: "Net cash change", amount: data.netCashChange, kind: "total" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Cash in")} value={formatPrice(data.inflows.total)} icon={ArrowDownCircle} iconColor="emerald" />
        <StatTile label={t("Cash out")} value={formatPrice(data.outflows.total)} icon={ArrowUpCircle} iconColor="rose" />
        <StatTile
          label={t("Net cash change")}
          value={formatPrice(data.netCashChange)}
          sublabel={t(positive ? "Cash positive" : "Cash negative")}
          icon={Wallet}
          iconColor={positive ? "emerald" : "rose"}
        />
        <StatTile
          label={t("Uncollected COD sales")}
          value={formatPrice(data.pendingCodOrderSales)}
          sublabel={t("Not yet delivered — not counted as cash")}
          icon={Clock}
          iconColor="amber"
        />
      </div>
      <DashboardCard
        title={t("Cash Flow Statement")}
        action={<StatusBadge good={positive} goodLabel="Cash positive" badLabel="Cash negative" />}
      >
        <StatementTable
          rows={rows}
          footnote="Order sales count as cash once delivered (COD) or when paid online. Supplier payments that were also entered as an expense are counted once, under expenses paid."
        />
      </DashboardCard>
    </>
  );
}

function BalanceSheetView({ data }: { data: Statements["balanceSheet"] }) {
  const { t } = useLocale();
  const solvent = data.equity.total >= 0;
  const debtRatio = data.assets.total > 0 ? (data.liabilities.total / data.assets.total) * 100 : null;
  const rows: StatementRow[] = [
    { label: "Assets", amount: 0, kind: "section" },
    { label: "Cash & bank (from recorded flows)", amount: data.assets.cash, kind: "item" },
    { label: "Inventory at cost", amount: data.assets.inventory, kind: "item" },
    { label: "Accounts receivable", amount: data.assets.accountsReceivable, kind: "item" },
    { label: "Total assets", amount: data.assets.total, kind: "subtotal" },
    { label: "Liabilities", amount: 0, kind: "section" },
    { label: "Accounts payable (suppliers)", amount: data.liabilities.accountsPayable, kind: "item" },
    { label: "Total liabilities", amount: data.liabilities.total, kind: "subtotal" },
    { label: "Equity", amount: 0, kind: "section" },
    { label: "Retained earnings (all-time net profit)", amount: data.equity.retainedEarnings, kind: "item" },
    { label: "Owner capital & other", amount: data.equity.ownerCapitalAndOther, kind: "item" },
    { label: "Total equity", amount: data.equity.total, kind: "subtotal" },
    { label: "Total liabilities & equity", amount: data.liabilities.total + data.equity.total, kind: "total" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Total assets")} value={formatPrice(data.assets.total)} icon={Landmark} iconColor="blue" />
        <StatTile label={t("Total liabilities")} value={formatPrice(data.liabilities.total)} icon={ArrowUpCircle} iconColor="rose" />
        <StatTile
          label={t("Total equity")}
          value={formatPrice(data.equity.total)}
          sublabel={t(solvent ? "Assets exceed liabilities" : "Liabilities exceed assets")}
          icon={Scale}
          iconColor={solvent ? "emerald" : "rose"}
        />
        <StatTile
          label={t("Debt ratio")}
          value={debtRatio === null ? "—" : percent(debtRatio)}
          sublabel={t("Liabilities ÷ assets")}
          icon={Percent}
          iconColor="amber"
        />
      </div>
      <DashboardCard
        title={`${t("Balance Sheet")} — ${t("as of today")}`}
        action={<StatusBadge good={solvent} goodLabel="Positive equity" badLabel="Negative equity" />}
      >
        <StatementTable
          rows={rows}
          footnote="Cash is derived from every recorded inflow and outflow, since the system has no opening bank balance. Owner capital & other is the balancing figure: starting capital plus anything never recorded as a flow, such as opening supplier balances."
        />
      </DashboardCard>
    </>
  );
}

/**
 * The Finance page's statement tabs — a read-only view over
 * GET /api/statements. The Balance Sheet is always as of today; the period
 * selector applies to the Income Statement and Cash Flow.
 */
export function FinancialStatements({ brandId, view }: { brandId: string; view: StatementView }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<Period>("ytd");
  const range = rangeFor(period);
  const { data, error, isLoading } = useSWR(["finance-statements", brandId, range.from, range.to], () =>
    getFinancialStatements(brandId, range),
  );

  return (
    <div className="flex flex-col gap-5">
      {view !== "balance" ? (
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                period === option.value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
            >
              {t(option.label)}
            </button>
          ))}
          {range.from ? (
            <span className="text-xs text-slate-400 tabular-nums dark:text-slate-500">
              {range.from} → {range.to}
            </span>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading statements..." />
        </div>
      ) : error ? (
        <EmptyState
          title={t("Couldn't load financial statements")}
          description={error instanceof ApiError ? error.message : t("Check that the backend API is running.")}
        />
      ) : !data ? null : view === "income" ? (
        <IncomeStatementView data={data.incomeStatement} />
      ) : view === "cashflow" ? (
        <CashFlowView data={data.cashFlow} />
      ) : (
        <BalanceSheetView data={data.balanceSheet} />
      )}
    </div>
  );
}
