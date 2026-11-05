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
    contribution: ContributionMargin;
  };
  cashFlow: {
    inflows: { collectedOrderSales: number; recordedRevenue: number; receivableCollections: number; total: number };
    outflows: { expensesPaid: number; supplierPaymentsNotInExpenses: number; shippingOnCollectedOrders: number; total: number };
    netCashChange: number;
    pendingCodOrderSales: number;
  };
  balanceSheet: {
    openingBalances: OpeningBalances;
    assets: { startingCash: number; recordedCashFlow: number; cash: number; inventory: number; accountsReceivable: number; total: number };
    liabilities: { accountsPayable: number; total: number };
    equity: { ownerCapital: number; retainedEarnings: number; otherAdjustments: number; total: number };
  };
}

export interface ContributionMargin {
  revenue: number;
  afterCostOfSales: number;
  fulfilment: number;
  afterFulfilment: number;
  marketing: number;
  afterMarketing: number;
  fixedCosts: number;
  netProfit: number;
  contributionRatio: number;
  breakEvenRevenue: number | null;
}

export interface CashIntelligence {
  monthly: { month: string; partial: boolean; inflows: number; outflows: number; netCash: number; netProfit: number }[];
  currentCash: number;
  startingBalancesSet: boolean;
  burnWindowMonths: number;
  avgMonthlyNetCash: number;
  monthlyBurn: number;
  runwayMonths: number | null;
}

export function getCashIntelligence(brandId: string): Promise<CashIntelligence> {
  return apiFetch<CashIntelligence>(`/api/statements/insights?brandId=${encodeURIComponent(brandId)}`);
}

export interface OpeningBalances {
  startingCash: number;
  ownerCapital: number;
  /** YYYY-MM-DD, or null for "before the first record". */
  asOfDate: string | null;
  isSet: boolean;
}

export function getFinancialStatements(brandId: string, range: { from?: string; to?: string }): Promise<FinancialStatements> {
  const params = new URLSearchParams({ brandId });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return apiFetch<FinancialStatements>(`/api/statements?${params.toString()}`);
}

export function saveOpeningBalances(input: {
  brandId: string;
  startingCash: number;
  ownerCapital: number;
  asOfDate: string | null;
}): Promise<OpeningBalances> {
  return apiFetch<OpeningBalances>("/api/statements/opening-balances", { method: "PUT", body: JSON.stringify(input) });
}
