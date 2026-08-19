"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Minus, Plus, Search } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listInventory, recordInboundMovement, recordOutboundMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useLocale } from "@/context/LocaleContext";
import type { InventoryRow } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";
import { StockFilters, type StockFilterState } from "./StockFilters";

const PAGE_SIZE = 20;

function rowKey(row: InventoryRow): string {
  return `${row.variantId}-${row.binId}`;
}

/** lowStockThreshold comes from Settings > Inventory Rules (defaults to 5) — same value the Dashboard's low-stock aggregate uses. */
function StockStatusBadge({ quantity, lowStockThreshold }: { quantity: number; lowStockThreshold: number }) {
  const { t } = useLocale();
  if (quantity === 0) return <Badge variant="danger">{t("Out of Stock")}</Badge>;
  if (quantity <= lowStockThreshold) return <Badge variant="orange">{t("Low Stock")}</Badge>;
  return <Badge variant="success">{t("In Stock")}</Badge>;
}

export function StockLevelsTable() {
  const { brand } = useWorkspace();
  const { t } = useLocale();
  const { settings } = useAppSettings();
  const lowStockThreshold = settings?.lowStockThreshold ?? 5;
  const [filters, setFilters] = useState<StockFilterState>({ categoryId: null, zoneId: null, binId: null });
  const [search, setSearch] = useState("");
  const [adjustingKey, setAdjustingKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const {
    data: rows,
    error,
    isLoading,
    mutate,
  } = useSWR(["inventory", brand.id, filters], () => listInventory({ brandId: brand.id, ...filters }));

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.productName, row.sku, row.binCode, row.zoneCode].join(" ").toLowerCase().includes(q),
    );
  }, [rows, q]);

  // Reset to page 1 whenever the search text or filters change — a
  // render-time adjustment (not an effect) so the stale page never paints.
  const [prevSearch, setPrevSearch] = useState(search);
  const [prevFilters, setPrevFilters] = useState(filters);
  if (search !== prevSearch || filters !== prevFilters) {
    setPrevSearch(search);
    setPrevFilters(filters);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleAdjust(row: InventoryRow, direction: 1 | -1) {
    const key = rowKey(row);
    setAdjustingKey(key);
    try {
      const result =
        direction === 1
          ? await recordInboundMovement({ variantId: row.variantId, binId: row.binId, quantity: 1 })
          : await recordOutboundMovement({ variantId: row.variantId, binId: row.binId, quantity: 1 });
      const nextQty = direction === 1 ? result.toBinQuantityAfter : result.fromBinQuantityAfter;
      if (rows && nextQty != null) {
        void mutate(
          rows.map((r) => (rowKey(r) === key ? { ...r, quantity: nextQty } : r)),
          { revalidate: false },
        );
      } else {
        void mutate();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Not enough stock in this bin");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Failed to adjust stock");
      }
    } finally {
      setAdjustingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by SKU, Product Name, or Bin")}
          className="ps-8"
        />
      </div>

      <StockFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading stock levels..." />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load stock levels"
          description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
        />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          title="No stock found"
          description="Nothing matches the current filters, or no inbound movements have been recorded yet."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 py-3">{t("Image")}</TableHead>
                <TableHead className="py-3">{t("Product")}</TableHead>
                <TableHead className="py-3">{t("SKU")}</TableHead>
                <TableHead className="py-3">{t("Category")}</TableHead>
                <TableHead className="py-3">{t("Bin / Zone")}</TableHead>
                <TableHead className="py-3">{t("On-Hand Stock")}</TableHead>
                <TableHead className="py-3">{t("Status")}</TableHead>
                <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No stock rows match &quot;{search}&quot;.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => {
                  const key = rowKey(row);
                  const busy = adjustingKey === key;
                  return (
                    <TableRow key={key}>
                      <TableCell className="py-3">
                        <ProductThumbnail imageUrl={row.imageUrl} name={row.productName} size={36} />
                      </TableCell>
                      <TableCell className="py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{row.productName}</p>
                        {row.attributes.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.attributes.map((attr) => (
                              <Badge key={`${attr.attributeName}-${attr.value}`}>{attr.value}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {row.sku}
                      </TableCell>
                      <TableCell className="py-3 text-slate-600 dark:text-slate-400">{row.category.name}</TableCell>
                      <TableCell className="py-3">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {row.zoneCode} / {row.binCode}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            row.quantity > 0 ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-600"
                          }`}
                        >
                          {row.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <StockStatusBadge quantity={row.quantity} lowStockThreshold={lowStockThreshold} />
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => void handleAdjust(row, -1)}
                            disabled={busy || row.quantity === 0}
                            aria-label={`Decrease stock for ${row.sku}`}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => void handleAdjust(row, 1)}
                            disabled={busy}
                            aria-label={`Increase stock for ${row.sku}`}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("Showing")} {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(filtered.length, currentPage * PAGE_SIZE)} {t("of")} {filtered.length}
            </p>
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
