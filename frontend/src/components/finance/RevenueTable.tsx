"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { formatPrice } from "@/lib/formatPrice";
import type { Revenue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RevenueCategoryBadge } from "./RevenueCategoryBadge";

const PAGE_SIZE = 12;

/** "2026-07-14" formatted without going through Date's local-timezone parsing, which would shift the day backward in negative-offset zones. */
function formatRevenueDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RevenueTable({
  revenues,
  search,
  onEdit,
  onDelete,
}: {
  revenues: Revenue[];
  search: string;
  onEdit: (revenue: Revenue) => void;
  onDelete: (revenue: Revenue) => void;
}) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? revenues.filter((revenue) =>
        [revenue.source, revenue.notes ?? "", revenue.category].join(" ").toLowerCase().includes(query),
      )
    : revenues;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped on read rather than reset via an effect: when a filter shrinks
  // the list, the current page can fall out of range mid-render, and this
  // resolves it without a second render pass.
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={query ? `${t("No revenue entries match")} "${search}"` : t("No revenue recorded yet")}
        description={query ? undefined : t("Add your first revenue entry to see Gross Revenue and Net Profit update.")}
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
              <TableHead className="py-3">{t("Source")}</TableHead>
              <TableHead className="py-3">{t("Category")}</TableHead>
              <TableHead className="py-3 text-end">{t("Amount")}</TableHead>
              <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((revenue) => (
              <TableRow key={revenue.id}>
                <TableCell className="whitespace-nowrap py-3 text-xs text-slate-500 dark:text-slate-400">
                  {formatRevenueDate(revenue.revenueDate)}
                </TableCell>
                <TableCell className="py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{revenue.source}</p>
                  {revenue.notes ? (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400 dark:text-slate-500">{revenue.notes}</p>
                  ) : null}
                </TableCell>
                <TableCell className="py-3">
                  <RevenueCategoryBadge category={revenue.category} />
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-end font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatPrice(revenue.amount)}
                </TableCell>
                <TableCell className="py-3 text-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${t("Actions")} — ${revenue.source}`}>
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(revenue)}>{t("Edit")}</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(revenue)}>
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
