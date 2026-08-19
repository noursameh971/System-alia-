"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  Landmark,
  Percent,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { formatPrice } from "@/lib/formatPrice";
import { workspaceHomePath } from "@/lib/routing";
import {
  deleteExpense,
  exportExpensesWorkbook,
  getFinanceSummary,
  listExpenses,
  EXPENSE_CATEGORY_META,
} from "@/lib/expenses";
import { exportLedgerWorkbook, getCashFlowSummary, listLedgerEntities } from "@/lib/ledger";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type LedgerEntity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { ExpenseBreakdownChart } from "@/components/finance/ExpenseBreakdownChart";
import { ExpenseTable } from "@/components/finance/ExpenseTable";
import { ExpenseFormModal } from "@/components/finance/ExpenseFormModal";
import { ImportExpensesModal } from "@/components/finance/ImportExpensesModal";
import { LedgerTable } from "@/components/finance/LedgerTable";
import { OpeningBalanceModal } from "@/components/finance/OpeningBalanceModal";
import { RecordPaymentModal } from "@/components/finance/RecordPaymentModal";

export default function FinancePage() {
  const router = useRouter();
  const { brand } = useWorkspace();
  const { role, isLoading: isSessionLoading } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingLedger, setExportingLedger] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [openingBalanceOpen, setOpeningBalanceOpen] = useState(false);
  const [payingEntity, setPayingEntity] = useState<LedgerEntity | null>(null);

  // All keyed on brand.id so switching workspace refetches rather than
  // showing another brand's data for a frame.
  const summary = useSWR(["finance-summary", brand.id], () => getFinanceSummary(brand.id));
  const ledger = useSWR(["expenses", brand.id, categoryFilter], () =>
    listExpenses({ brandId: brand.id, category: categoryFilter || null }),
  );
  const cashFlow = useSWR(["cash-flow-summary", brand.id], () => getCashFlowSummary(brand.id));
  const suppliers = useSWR(["ledger-entities", brand.id], () => listLedgerEntities(brand.id));

  useEffect(() => {
    if (!isSessionLoading && !isAdmin) router.replace(workspaceHomePath(brand.code));
  }, [isSessionLoading, isAdmin, brand.code, router]);

  if (isSessionLoading || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  // Passed to every mutating action on this page (expense CRUD, opening
  // balances, payments, and both import paths) — a payment against one
  // supplier can move the Accounts Payable/Receivable cards, Net Cash Flow,
  // *and* that supplier's row, so all four data sources refresh together
  // rather than each action guessing which subset it affected.
  function refreshAll() {
    void summary.mutate();
    void ledger.mutate();
    void cashFlow.mutate();
    void suppliers.mutate();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportExpensesWorkbook(brand.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `expenses-${brand.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to export expenses"));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportLedger() {
    setExportingLedger(true);
    try {
      const blob = await exportLedgerWorkbook(brand.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ledger-${brand.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to export the ledger"));
    } finally {
      setExportingLedger(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteExpense(deleteTarget.id);
      toast.success(t("Expense deleted"));
      refreshAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to delete the expense"));
    } finally {
      setDeleteTarget(null);
    }
  }

  const data = summary.data;
  const cashFlowData = cashFlow.data;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("Finance & Expenses")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {brand.name} — {t("revenue, costs, and profitability")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? t("Exporting...") : t("Export Excel")}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            {t("Import Excel")}
          </Button>
          <Button variant="outline" onClick={() => setOpeningBalanceOpen(true)}>
            <Landmark className="size-4" />
            {t("Opening Balances")}
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("Add Expense")}
          </Button>
        </div>
      </div>

      {summary.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading finance data..." />
        </div>
      ) : summary.error ? (
        <EmptyState
          title={t("Couldn't load finance data")}
          description={summary.error instanceof ApiError ? summary.error.message : t("Check that the backend API is running.")}
        />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t("Gross Revenue")}
              value={formatPrice(data.grossRevenue)}
              sublabel={`${data.orderCount} ${t(data.orderCount === 1 ? "order" : "orders")}`}
              icon={TrendingUp}
              iconColor="emerald"
            />
            <StatTile
              label={t("Total COGS & Expenses")}
              value={formatPrice(data.totalExpenses)}
              sublabel={t("Production + shipping + operating")}
              icon={Receipt}
              iconColor="rose"
            />
            <StatTile
              label={t("Net Profit")}
              value={formatPrice(data.netProfit)}
              sublabel={t("Revenue − total expenses")}
              icon={PiggyBank}
              iconColor="violet"
            />
            <StatTile
              label={t("Profit Margin")}
              value={`${data.profitMargin.toFixed(1)}%`}
              sublabel={t("Net profit ÷ revenue")}
              icon={Percent}
              iconColor="indigo"
            />
          </div>

          {/* The three components of Total Expenses, so the KPI above is
              auditable rather than an opaque total. */}
          <DashboardCard title={t("Where the money goes")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile variant="flat" label={t("Production cost (COGS)")} value={formatPrice(data.cogs)} />
              <StatTile variant="flat" label={t("Shipping")} value={formatPrice(data.shipping)} />
              <StatTile
                variant="flat"
                label={t("Operating expenses")}
                value={formatPrice(data.operatingExpenses)}
                sublabel={`${data.expenseCount} ${t(data.expenseCount === 1 ? "entry" : "entries")}`}
              />
            </div>
          </DashboardCard>

          <DashboardCard title={t("Monthly expenses breakdown")}>
            <ExpenseBreakdownChart data={data.monthly} />
          </DashboardCard>
        </>
      )}

      {/* Cash Flow & Debt is deliberately its own row, not folded into the
          P&L cards above: accrual profit and actual liquidity are different
          questions, and merging them into one KPI row would make Net Cash
          Flow read as a fifth variation on Net Profit instead of what it is. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Cash Flow & Debt")}</h2>
        {cashFlow.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading cash flow..." />
          </div>
        ) : cashFlow.error ? (
          <EmptyState
            title={t("Couldn't load cash flow data")}
            description={cashFlow.error instanceof ApiError ? cashFlow.error.message : t("Check that the backend API is running.")}
          />
        ) : !cashFlowData ? null : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={t("Accounts Payable")}
              value={formatPrice(cashFlowData.accountsPayable)}
              sublabel={t("Owed to suppliers & factories")}
              icon={ArrowUpCircle}
              iconColor="rose"
            />
            <StatTile
              label={t("Accounts Receivable")}
              value={formatPrice(cashFlowData.accountsReceivable)}
              sublabel={t("Held by couriers & clients")}
              icon={ArrowDownCircle}
              iconColor="emerald"
            />
            <StatTile
              label={t("Net Cash Flow")}
              value={formatPrice(cashFlowData.netCashFlow)}
              sublabel={t("Net profit − payable + receivable")}
              icon={Wallet}
              iconColor="indigo"
            />
          </div>
        )}
      </div>

      <DashboardCard
        title={t("Suppliers & Debts Ledger")}
        action={
          <Button variant="outline" size="sm" onClick={() => void handleExportLedger()} disabled={exportingLedger}>
            <Download className="size-3.5" />
            {exportingLedger ? t("Exporting...") : t("Export Excel")}
          </Button>
        }
      >
        {suppliers.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading suppliers..." />
          </div>
        ) : suppliers.error ? (
          <EmptyState
            title={t("Couldn't load the ledger")}
            description={suppliers.error instanceof ApiError ? suppliers.error.message : t("Check that the backend API is running.")}
          />
        ) : (
          <LedgerTable entities={suppliers.data ?? []} onRecordPayment={setPayingEntity} />
        )}
      </DashboardCard>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Expenses")}</h2>

          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Search expenses")}
              className="ps-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={categoryFilter === ""} onClick={() => setCategoryFilter("")}>
            {t("All")}
          </FilterPill>
          {EXPENSE_CATEGORIES.map((category) => (
            <FilterPill
              key={category}
              active={categoryFilter === category}
              onClick={() => setCategoryFilter(category)}
            >
              {t(EXPENSE_CATEGORY_META[category].label)}
            </FilterPill>
          ))}
        </div>

        {ledger.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading expenses..." />
          </div>
        ) : ledger.error ? (
          <EmptyState
            title={t("Couldn't load expenses")}
            description={ledger.error instanceof ApiError ? ledger.error.message : t("Check that the backend API is running.")}
          />
        ) : (
          <ExpenseTable
            expenses={ledger.data ?? []}
            search={search}
            onEdit={(expense) => {
              setEditing(expense);
              setFormOpen(true);
            }}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      <ExpenseFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        brandId={brand.id}
        editing={editing}
        onSuccess={refreshAll}
      />

      <ImportExpensesModal open={importOpen} onOpenChange={setImportOpen} brandId={brand.id} onSuccess={refreshAll} />

      <OpeningBalanceModal
        open={openingBalanceOpen}
        onOpenChange={setOpeningBalanceOpen}
        brandId={brand.id}
        onSuccess={refreshAll}
      />

      <RecordPaymentModal entity={payingEntity} onOpenChange={(open) => !open && setPayingEntity(null)} onSuccess={refreshAll} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("Delete expense")}
        description={
          deleteTarget
            ? `${t("This permanently removes")} "${deleteTarget.title}" (${formatPrice(deleteTarget.amount)}).`
            : ""
        }
        confirmLabel={t("Delete")}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
