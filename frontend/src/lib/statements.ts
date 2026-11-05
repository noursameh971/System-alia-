import { apiFetch } from "./apiClient";
import type { ExpenseCategory, RevenueCategory } from "./types";

/** Mirrors backend/src/modules/statements/statements.service.ts. */
export interface FinancialStatements {
  range: { from?: string; to?: string };
  incomeStatement: {
    orderRevenue: number;
    otherRevenue: Record<RevenueCategory, number>;
    totalRevenue: number;
    costOfSales: { orderCogs: number; productionExpenses: number; total: number };
    grossProfit: number;
    grossMargin: number;
    shipping: number;
    operatingExpensesByCategory: Record<Exclude<ExpenseCategory, "production">, number>;
    totalOperatingExpenses: number;
    netProfit: number;
    netMargin: number;
  };
  cashFlow: {
    inflows: { collectedOrderSales: number; recordedRevenue: number; receivableCollections: number; total: number };
    outflows: { expensesPaid: number; supplierPaymentsNotInExpenses: number; shippingOnCollectedOrders: number; total: number };
    netCashChange: number;
    pendingCodOrderSales: number;
  };
  balanceSheet: {
    assets: { cash: number; inventory: number; accountsReceivable: number; total: number };
    liabilities: { accountsPayable: number; total: number };
    equity: { retainedEarnings: number; ownerCapitalAndOther: number; total: number };
  };
}

export function getFinancialStatements(brandId: string, range: { from?: string; to?: string }): Promise<FinancialStatements> {
  const params = new URLSearchParams({ brandId });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return apiFetch<FinancialStatements>(`/api/statements?${params.toString()}`);
}
