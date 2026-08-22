"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/formatPrice";
import { ProductCategorySelect } from "./ProductCategorySelect";
import { ProductThumbnail } from "./ProductThumbnail";

interface ProductsGroupedTableProps {
  products: Product[];
  search: string;
  /** Category id, or "" for "All Categories". */
  categoryFilter: string;
  onOpenProduct: (product: Product) => void;
  /** Lets the Category cell's dropdown edit that row's category in place — omitted (falls back to plain text) for callers/roles that shouldn't edit the catalog. */
  canManageCategory?: boolean;
  /** Refreshes the product list after a row's category changes. Required whenever canManageCategory is true. */
  onProductUpdated?: () => void;
  /** Bulk-select checkboxes for the "Set Category" action — omitted entirely (no checkbox column) for callers/roles that don't need it. */
  selection?: {
    selectedIds: Set<string>;
    onToggleOne: (productId: string) => void;
    onToggleMany: (productIds: string[], checked: boolean) => void;
  };
}

/** Header checkbox for "select all visible rows" — needs a ref because the indeterminate (some-but-not-all) state has no HTML attribute, only a DOM property. */
function SelectAllCheckbox({ visibleIds, selectedIds, onToggleMany }: { visibleIds: string[]; selectedIds: Set<string>; onToggleMany: (ids: string[], checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={(e) => onToggleMany(visibleIds, e.target.checked)}
      disabled={visibleIds.length === 0}
      aria-label="Select all products on this page"
      className="size-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-700"
    />
  );
}

interface ProductRowData {
  product: Product;
  categoryName: string;
  priceLabel: string;
  totalStock: number;
  colors: string[];
  allDiscontinued: boolean;
}

/** A single price once every variant agrees (the common case now that price edits sync across a product); a min–max range otherwise. */
function priceLabelFor(product: Product): string {
  const prices = product.variants.map((v) => v.price).filter((p): p is number => p != null);
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const currency = product.variants.find((v) => v.currency)?.currency ?? "EGP";
  return min === max ? formatPrice(min, currency) : `${formatPrice(min, currency)} – ${formatPrice(max, currency)}`;
}

function colorsFor(product: Product): string[] {
  const seen = new Set<string>();
  for (const variant of product.variants) {
    const color = variant.attributes.find((a) => a.attributeName.toLowerCase() === "color")?.value;
    if (color) seen.add(color);
  }
  return [...seen];
}

function toRow(product: Product): ProductRowData {
  return {
    product,
    categoryName: product.category.name,
    priceLabel: priceLabelFor(product),
    totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
    colors: colorsFor(product),
    allDiscontinued: product.variants.length > 0 && product.variants.every((v) => v.status !== "active"),
  };
}

const PAGE_SIZE = 15;
const MAX_COLOR_CHIPS = 4;

export function ProductsGroupedTable({
  products,
  search,
  categoryFilter,
  onOpenProduct,
  canManageCategory = false,
  onProductUpdated,
  selection,
}: ProductsGroupedTableProps) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);

  // Search and the category filter are both owned by the page header above
  // this card. Resetting to page 1 when either changes is a render-time
  // adjustment (React's documented pattern for "reset state when a prop
  // changes"), not an effect — it runs during render itself, before the
  // stale page number ever paints.
  const [prevSearch, setPrevSearch] = useState(search);
  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (search !== prevSearch || categoryFilter !== prevCategoryFilter) {
    setPrevSearch(search);
    setPrevCategoryFilter(categoryFilter);
    setPage(1);
  }

  const rows = useMemo(() => products.map(toRow), [products]);

  const filtered = useMemo(() => {
    const byCategory = categoryFilter ? rows.filter((row) => row.product.category.id === categoryFilter) : rows;

    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) =>
      [row.product.name, row.categoryName, ...row.colors, ...row.product.variants.map((v) => v.sku)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = useMemo(() => visible.map((row) => row.product.id), [visible]);
  const columnCount = selection ? 7 : 6;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection ? (
              <TableHead className="w-10 py-3">
                <SelectAllCheckbox visibleIds={visibleIds} selectedIds={selection.selectedIds} onToggleMany={selection.onToggleMany} />
              </TableHead>
            ) : null}
            <TableHead className="w-14 py-3">{t("Image")}</TableHead>
            <TableHead className="py-3">{t("Product")}</TableHead>
            <TableHead className="py-3">{t("Category")}</TableHead>
            <TableHead className="py-3">{t("Price")}</TableHead>
            <TableHead className="py-3">{t("Total Stock")}</TableHead>
            <TableHead className="py-3">{t("Colors")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("No products match")} &quot;{search}&quot;.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => {
              const overflowCount = row.colors.length - MAX_COLOR_CHIPS;
              const isSelected = selection?.selectedIds.has(row.product.id) ?? false;
              return (
                <TableRow
                  key={row.product.id}
                  onClick={() => onOpenProduct(row.product)}
                  className="cursor-pointer"
                  data-state={isSelected ? "selected" : undefined}
                >
                  {selection ? (
                    <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => selection.onToggleOne(row.product.id)}
                        aria-label={`Select ${row.product.name}`}
                        className="size-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-700"
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="py-4">
                    <ProductThumbnail imageUrl={row.product.imageUrl} name={row.product.name} size={40} />
                  </TableCell>
                  <TableCell className="py-4 font-semibold text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <span>{row.product.name}</span>
                      {row.allDiscontinued ? <Badge variant="warning">{t("discontinued")}</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                      {row.product.variants.length} {t(row.product.variants.length === 1 ? "variant" : "variants")}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-slate-600 dark:text-slate-400">
                    <ProductCategorySelect
                      productId={row.product.id}
                      categoryName={row.categoryName}
                      canManage={canManageCategory}
                      onSaved={() => onProductUpdated?.()}
                    />
                  </TableCell>
                  <TableCell className="py-4 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {row.priceLabel}
                  </TableCell>
                  <TableCell className="py-4 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {row.totalStock}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {row.colors.slice(0, MAX_COLOR_CHIPS).map((color) => (
                        <Badge key={color} variant="brand">
                          {color}
                        </Badge>
                      ))}
                      {overflowCount > 0 ? <Badge variant="neutral">+{overflowCount}</Badge> : null}
                      {row.colors.length === 0 ? <span className="text-sm text-slate-400">—</span> : null}
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
  );
}
