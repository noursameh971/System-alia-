"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type DragEndEvent, DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
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
  /**
   * Lets the Products page's rows be manually reordered with up/down move
   * buttons — omitted entirely (no column) for callers/roles that shouldn't
   * edit the catalog. Only meaningful while the list is unfiltered (search
   * and category filter both empty), since a move swaps with the row's true
   * neighbor in the full brand order, which may not be adjacent once the
   * list is filtered — the buttons disable themselves in that case.
   */
  onReorder?: (productId: string, direction: "up" | "down") => void;
  /**
   * Lets the same rows also be reordered by dragging them with a mouse —
   * an alternative to the up/down buttons above, not a replacement; both
   * write the same sort_order. Called with the complete, already-reordered
   * list of every product in the (unfiltered) brand order once a drag
   * drops. Gated by the same canReorderNow rule as onReorder.
   */
  onReorderDrag?: (orderedProductIds: string[]) => void;
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

/**
 * A small numeric field showing a row's 1-based position in the full brand
 * order, editable in place — committing a new number (on blur or Enter)
 * moves the product straight there, including across pages. Uncontrolled
 * (defaultValue, not value): the parent doesn't fight the user's keystrokes
 * while they're typing, and the `key` remounts it to the fresh position
 * once a move actually lands (or is cancelled by re-typing the same page's
 * data), so it never shows a stale number after the list resorts.
 */
function OrderNumberInput({
  productId,
  position,
  total,
  disabled,
  onMove,
  label,
}: {
  productId: string;
  position: number;
  total: number;
  disabled: boolean;
  onMove: (productId: string, targetIndex: number) => void;
  label: string;
}) {
  function commit(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(total, Math.max(1, Math.round(parsed)));
    if (clamped !== position) onMove(productId, clamped - 1);
  }

  return (
    <input
      key={position}
      type="number"
      min={1}
      max={total}
      defaultValue={position}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => commit(e.target.value)}
      aria-label={label}
      title={disabled ? undefined : label}
      className="w-11 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-xs font-medium tabular-nums text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
    />
  );
}

interface ProductTableRowProps {
  row: ProductRowData;
  onOpenProduct: (product: Product) => void;
  canManageCategory: boolean;
  onProductUpdated?: () => void;
  isSelected: boolean;
  selection?: ProductsGroupedTableProps["selection"];
  showOrderColumn: boolean;
  onReorder?: (productId: string, direction: "up" | "down") => void;
  onMoveToPosition?: (productId: string, targetIndex: number) => void;
  canReorderNow: boolean;
  dragEnabled: boolean;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  t: (key: string) => string;
}

/**
 * One row of the products table, extracted so useSortable (a hook) can be
 * called once per row in a stable, consistent order across renders — it
 * can't be called inline inside the parent's .map() callback.
 */
function ProductTableRow({
  row,
  onOpenProduct,
  canManageCategory,
  onProductUpdated,
  isSelected,
  selection,
  showOrderColumn,
  onReorder,
  onMoveToPosition,
  canReorderNow,
  dragEnabled,
  index,
  total,
  isFirst,
  isLast,
  t,
}: ProductTableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.product.id,
    disabled: !dragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
    zIndex: isDragging ? 1 : undefined,
  };

  const overflowCount = row.colors.length - MAX_COLOR_CHIPS;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
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
      {showOrderColumn ? (
        <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              ref={setActivatorNodeRef}
              type="button"
              disabled={!dragEnabled}
              aria-label={`${t("Drag to reorder")} — ${row.product.name}`}
              title={dragEnabled ? undefined : t("Clear search and category filter to reorder")}
              style={{ touchAction: "none" }}
              className="cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-200"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            {onReorder ? (
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onReorder(row.product.id, "up")}
                  disabled={!canReorderNow || isFirst}
                  aria-label={`${t("Move up")} — ${row.product.name}`}
                  title={canReorderNow ? undefined : t("Clear search and category filter to reorder")}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(row.product.id, "down")}
                  disabled={!canReorderNow || isLast}
                  aria-label={`${t("Move down")} — ${row.product.name}`}
                  title={canReorderNow ? undefined : t("Clear search and category filter to reorder")}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            ) : null}
            {onMoveToPosition ? (
              <OrderNumberInput
                productId={row.product.id}
                position={index + 1}
                total={total}
                disabled={!canReorderNow}
                onMove={onMoveToPosition}
                label={`${t("Set position")} — ${row.product.name}`}
              />
            ) : null}
          </div>
        </TableCell>
      ) : null}
      <TableCell className="py-2">
        <ProductThumbnail imageUrl={row.product.imageUrl} name={row.product.name} size={72} />
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
      <TableCell className="py-4 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{row.priceLabel}</TableCell>
      <TableCell className="py-4 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{row.totalStock}</TableCell>
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
}

export function ProductsGroupedTable({
  products,
  search,
  categoryFilter,
  onOpenProduct,
  canManageCategory = false,
  onProductUpdated,
  onReorder,
  onReorderDrag,
  selection,
}: ProductsGroupedTableProps) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  // "View all" trades pagination for one scrollable list — mainly so
  // dragging or typing a position across a wide range doesn't require
  // paging back and forth first.
  const [viewAll, setViewAll] = useState(false);

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

  const effectivePageSize = viewAll ? Math.max(filtered.length, 1) : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);
  const visibleIds = useMemo(() => visible.map((row) => row.product.id), [visible]);

  // Reordering (both the up/down buttons and dragging) swaps/moves a row
  // within the full brand-sorted list (see products.service.ts's
  // reorderProduct / setProductSortOrder) — only sound to expose while that
  // order is actually what's on screen, i.e. no search or category filter
  // narrowing which rows are visible/adjacent.
  const canReorderNow = Boolean(onReorder) && !search.trim() && !categoryFilter;
  const dragEnabled = Boolean(onReorderDrag) && canReorderNow;
  const filteredIndexById = useMemo(() => new Map(filtered.map((row, i) => [row.product.id, i])), [filtered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!onReorderDrag || !dragEnabled || !over || active.id === over.id) return;

    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedVisible = arrayMove(visibleIds, oldIndex, newIndex);

    // Splice this page's newly dragged order back into the full brand
    // order — every product outside the current page keeps its existing
    // relative position, only this page's slice changes. Sound only while
    // `filtered` already equals the full unfiltered brand order (dragEnabled
    // guarantees that above).
    const fullOrderIds = filtered.map((row) => row.product.id);
    const pageStart = (currentPage - 1) * effectivePageSize;
    fullOrderIds.splice(pageStart, reorderedVisible.length, ...reorderedVisible);
    onReorderDrag(fullOrderIds);
  }

  /**
   * Backs the typed position field — moves a product straight to an
   * arbitrary index in the full brand order, across pages, in one step.
   * Reuses onReorderDrag's persistence (same full-order-array shape as a
   * drag drop produces), so there's one move path on the wire either way.
   */
  function handleMoveToPosition(productId: string, targetIndex: number) {
    if (!onReorderDrag || !dragEnabled) return;
    const fullOrderIds = filtered.map((row) => row.product.id);
    const oldIndex = fullOrderIds.indexOf(productId);
    const clampedTarget = Math.min(targetIndex, fullOrderIds.length - 1);
    if (oldIndex === -1 || oldIndex === clampedTarget) return;

    onReorderDrag(arrayMove(fullOrderIds, oldIndex, clampedTarget));
  }

  const showOrderColumn = Boolean(onReorder || onReorderDrag);
  const columnCount = (selection ? 1 : 0) + (showOrderColumn ? 1 : 0) + 6;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selection ? (
                <TableHead className="w-10 py-3">
                  <SelectAllCheckbox visibleIds={visibleIds} selectedIds={selection.selectedIds} onToggleMany={selection.onToggleMany} />
                </TableHead>
              ) : null}
              {/* "Position" here, not "Order" — the dictionary's "Order" key means a sales order elsewhere in the app. */}
              {showOrderColumn ? <TableHead className="w-32 py-3">{t("Position")}</TableHead> : null}
              <TableHead className="w-24 py-3">{t("Image")}</TableHead>
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
              <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                {visible.map((row) => {
                  const index = filteredIndexById.get(row.product.id) ?? 0;
                  return (
                    <ProductTableRow
                      key={row.product.id}
                      row={row}
                      onOpenProduct={onOpenProduct}
                      canManageCategory={canManageCategory}
                      onProductUpdated={onProductUpdated}
                      isSelected={selection?.selectedIds.has(row.product.id) ?? false}
                      selection={selection}
                      showOrderColumn={showOrderColumn}
                      onReorder={onReorder}
                      onMoveToPosition={dragEnabled ? handleMoveToPosition : undefined}
                      canReorderNow={canReorderNow}
                      dragEnabled={dragEnabled}
                      index={index}
                      total={filtered.length}
                      isFirst={index === 0}
                      isLast={index === filtered.length - 1}
                      t={t}
                    />
                  );
                })}
              </SortableContext>
            )}
          </TableBody>
        </Table>
      </DndContext>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {viewAll
              ? `${t("Showing all")} ${filtered.length}`
              : `${t("Showing")} ${filtered.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}–${Math.min(filtered.length, currentPage * effectivePageSize)} ${t("of")} ${filtered.length}`}
          </p>
          {filtered.length > PAGE_SIZE ? (
            <button
              type="button"
              onClick={() => {
                setViewAll((v) => !v);
                setPage(1);
              }}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {viewAll ? t("Show pages") : t("View all")}
            </button>
          ) : null}
        </div>
        {viewAll ? null : <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />}
      </div>
    </div>
  );
}
