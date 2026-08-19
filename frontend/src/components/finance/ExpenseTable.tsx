"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { EXPENSE_PAYMENT_LABEL } from "@/lib/expenses";
import { formatPrice } from "@/lib/formatPrice";
import type { Expense } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExpenseCategoryBadge } from "./ExpenseCategoryBadge";

const PAGE_SIZE = 12;

/** "2026-07-14" formatted without going through Date's local-timezone parsing, which would shift the day backward in negative-offset zones. */
function formatExpenseDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ExpenseTable({
  expenses,
  search,
  onEdit,
  onDelete,
}: {
  expenses: Expense[];
  search: string;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? expenses.filter((expense) =>
        [expense.title, expense.notes ?? "", expense.category].join(" ").toLowerCase().includes(query),
      )
    : expenses;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped on read rather than reset via an effect: when a filter shrinks
  // the list, the current page can fall out of range mid-render, and this
  // resolves it without a second render pass.
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={query ? `${t("No expenses match")} "${search}"` : t("No expenses recorded yet")}
        description={query ? undefined : t("Add your first expense to start tracking profitability.")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="py-3">{t("Date")}</TableHead>
              <TableHead className="py-3">{t("Title")}</TableHead>
              <TableHead className="py-3">{t("Category")}</TableHead>
              <TableHead className="py-3 text-end">{t("Amount")}</TableHead>
              <TableHead className="py-3">{t("Payment")}</TableHead>
              <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="whitespace-nowrap py-3 text-xs text-slate-500 dark:text-slate-400">
                  {formatExpenseDate(expense.expenseDate)}
                </TableCell>
                <TableCell className="py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{expense.title}</p>
                  {expense.notes ? (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400 dark:text-slate-500">{expense.notes}</p>
                  ) : null}
                </TableCell>
                <TableCell className="py-3">
                  <ExpenseCategoryBadge category={expense.category} />
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-end font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatPrice(expense.amount)}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs text-slate-500 dark:text-slate-400">
                  {t(EXPENSE_PAYMENT_LABEL[expense.paymentMethod])}
                </TableCell>
                <TableCell className="py-3 text-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${t("Actions")} — ${expense.title}`}>
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(expense)}>{t("Edit")}</DropdownMenuItem>
                      {expense.receiptUrl ? (
                        <DropdownMenuItem onSelect={() => window.open(expense.receiptUrl!, "_blank", "noopener")}>
                          {t("View receipt")}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(expense)}>
                        {t("Delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("Showing")} {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, currentPage * PAGE_SIZE)}{" "}
            {t("of")} {filtered.length}
          </p>
          <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}
