"use client";

import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Check, Minus, MoreHorizontal, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { Product, VariantStatus } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { deleteProductVariant, setVariantStock, updateProductCost, updateProductPrice } from "@/lib/products";
import { formatPrice } from "@/lib/formatPrice";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductFormModal, type EditableVariant } from "./ProductFormModal";
import { ProductCategorySelect } from "./ProductCategorySelect";
import { ProductThumbnail } from "./ProductThumbnail";
import { VariantPrintButton } from "./VariantPrintButton";
import { BatchLabelPrintView, type PrintableVariant } from "./BatchLabelPrintView";

interface ProductProfileDrawerProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onMutate: () => void;
}

function attributeValue(attributes: { attributeName: string; value: string }[], name: string): string {
  return attributes.find((a) => a.attributeName.toLowerCase() === name.toLowerCase())?.value ?? "—";
}

/** The product's "current" price/currency for display — the first priced variant's, plus whether every variant actually agrees with it. */
function productPriceInfo(product: Product): { price: number | null; currency: string | null; uniform: boolean } {
  const priced = product.variants.filter((v) => v.price != null);
  if (priced.length === 0) return { price: null, currency: null, uniform: true };
  const first = priced[0]!;
  return { price: first.price, currency: first.currency, uniform: priced.every((v) => v.price === first.price) };
}

/** Same as productPriceInfo, for production cost — a product can have no cost set at all (cost tracking is opt-in). */
function productCostInfo(product: Product): { cost: number | null; uniform: boolean } {
  const costed = product.variants.filter((v) => v.cost != null);
  if (costed.length === 0) return { cost: null, uniform: true };
  const first = costed[0]!;
  return { cost: first.cost, uniform: costed.every((v) => v.cost === first.cost) };
}

/**
 * Click-to-edit "Price" field for the whole product. Writes through
 * updateProductPrice, which fans the new price out to every variant of the
 * product — so this is the drawer's way of collapsing a mismatched
 * per-variant price range back to a single number.
 */
function ProductPriceEditor({
  productId,
  price,
  currency,
  canManage,
  onSaved,
}: {
  productId: string;
  price: number | null;
  currency: string | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price != null ? String(price) : "");
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setValue(price != null ? String(price) : "");
    setEditing(true);
  }

  async function handleSave() {
    const next = Number(value);
    if (!value.trim() || Number.isNaN(next) || next <= 0) {
      toast.error("Enter a price greater than 0");
      return;
    }

    setSaving(true);
    try {
      const result = await updateProductPrice(productId, next);
      toast.success(`Price updated across ${result.variantCount} variant${result.variantCount === 1 ? "" : "s"}`);
      onSaved();
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update price");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (!canManage) {
    return <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPrice(price, currency)}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="group flex items-baseline gap-1.5 rounded-md px-1 py-0.5 text-start hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPrice(price, currency)}</span>
        <Pencil className="size-3 text-slate-400 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min="0"
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="h-8 w-28"
        aria-label="Product price"
      />
      <Button type="button" size="icon" className="size-8" onClick={() => void handleSave()} disabled={saving}>
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Click-to-edit "Production cost" field for the whole product — same
 * fan-out-to-every-variant behavior as ProductPriceEditor above, via
 * updateProductCost. Only ever rendered for canManage (admin) callers —
 * unlike price, cost is sensitive business data that shouldn't be visible
 * to warehouse staff at all, not just non-editable.
 */
function ProductCostEditor({
  productId,
  cost,
  onSaved,
}: {
  productId: string;
  cost: number | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cost != null ? String(cost) : "");
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setValue(cost != null ? String(cost) : "");
    setEditing(true);
  }

  async function handleSave() {
    const next = Number(value);
    if (!value.trim() || Number.isNaN(next) || next < 0) {
      toast.error("Enter a cost of 0 or more");
      return;
    }

    setSaving(true);
    try {
      const result = await updateProductCost(productId, next);
      toast.success(`Production cost updated across ${result.variantCount} variant${result.variantCount === 1 ? "" : "s"}`);
      onSaved();
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update production cost");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="group flex items-baseline gap-1.5 rounded-md px-1 py-0.5 text-start hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatPrice(cost)}</span>
        <Pencil className="size-3 text-slate-400 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min="0"
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="h-8 w-28"
        aria-label="Production cost"
      />
      <Button type="button" size="icon" className="size-8" onClick={() => void handleSave()} disabled={saving}>
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * +/- steppers plus a directly-editable number, all writing through
 * setVariantStock immediately (no separate "save" step for the buttons).
 * Keyed by `${variantId}:${stock}` at the call site so a successful save —
 * which flows a fresh `stock` prop back in via onMutate — remounts this
 * with a clean initial value instead of needing an effect to resync it.
 */
function StockStepper({
  variantId,
  stock,
  canManage,
  onSaved,
}: {
  variantId: string;
  stock: number;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(stock));
  const [saving, setSaving] = useState(false);

  async function apply(next: number) {
    if (!Number.isInteger(next) || next < 0) {
      toast.error("Stock must be a whole number, 0 or more");
      setValue(String(stock));
      return;
    }
    if (next === stock) return;

    setSaving(true);
    try {
      await setVariantStock(variantId, next);
      toast.success("Stock updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update stock");
      setValue(String(stock));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void apply(Number(value));
    if (e.key === "Escape") setValue(String(stock));
  }

  if (!canManage) return <span>{stock}</span>;

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-7"
        onClick={() => void apply(stock - 1)}
        disabled={saving || stock <= 0}
        aria-label="Decrease stock"
      >
        <Minus className="size-3" />
      </Button>
      <Input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void apply(Number(value))}
        disabled={saving}
        className="h-7 w-14 px-1 text-center"
        aria-label="Stock quantity"
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-7"
        onClick={() => void apply(stock + 1)}
        disabled={saving}
        aria-label="Increase stock"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

export function ProductProfileDrawer({ product, onOpenChange, canManage, onMutate }: ProductProfileDrawerProps) {
  const { t } = useLocale();
  const [editingVariant, setEditingVariant] = useState<EditableVariant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableVariant | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintableVariant[] | null>(null);

  const open = product !== null;
  const totalStock = product ? product.variants.reduce((sum, v) => sum + v.stock, 0) : 0;
  const priceInfo = product ? productPriceInfo(product) : { price: null, currency: null, uniform: true };
  const costInfo = product ? productCostInfo(product) : { cost: null, uniform: true };

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      const result = await deleteProductVariant(deleteTarget.variantId);
      onMutate();
      if (result.deleted) {
        toast.success("Variant deleted");
      } else {
        toast.info("This variant has order or stock history, so it was marked discontinued instead of deleted");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete variant");
      throw err;
    }
  }

  function openPrintAll() {
    if (!product) return;
    // Snapshot the variants before closing the drawer — BatchLabelPrintView
    // is its own full-screen overlay, and leaving the Sheet open behind it
    // would stack two dark backdrops (the same double-blur issue as the old
    // QR modal), so the drawer closes first and `product` goes to null.
    const variants: PrintableVariant[] = product.variants.map((v) => ({
      sku: v.sku,
      productName: product.name,
      color: attributeValue(v.attributes, "color"),
      size: attributeValue(v.attributes, "size"),
      price: v.price,
      currency: v.currency,
    }));
    onOpenChange(false);
    setPrintTarget(variants);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
        <SheetContent>
          {product ? (
            <>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <ProductThumbnail imageUrl={product.imageUrl} name={product.name} size={56} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SheetTitle>{product.name}</SheetTitle>
                      <ProductCategorySelect
                        productId={product.id}
                        categoryName={product.category.name}
                        canManage={canManage}
                        onSaved={onMutate}
                        display="badge"
                      />
                    </div>
                    <SheetDescription>
                      {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} &middot; {totalStock} total
                      in stock
                    </SheetDescription>
                    <div className="mt-1 flex flex-wrap items-start gap-x-6 gap-y-2">
                      <div>
                        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Price</p>
                        <ProductPriceEditor
                          productId={product.id}
                          price={priceInfo.price}
                          currency={priceInfo.currency}
                          canManage={canManage}
                          onSaved={onMutate}
                        />
                        {!priceInfo.uniform ? (
                          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            Variants currently have different prices — saving sets all of them to one price.
                          </p>
                        ) : null}
                      </div>

                      {canManage ? (
                        <div>
                          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                            Production cost
                          </p>
                          <ProductCostEditor productId={product.id} cost={costInfo.cost} onSaved={onMutate} />
                          {!costInfo.uniform ? (
                            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                              Variants currently have different costs — saving sets all of them to one cost.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <SheetBody>
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-2">{t("Color")}</TableHead>
                        <TableHead className="px-2">{t("Size")}</TableHead>
                        <TableHead className="px-2">{t("SKU")}</TableHead>
                        <TableHead className="px-2">{t("Price")}</TableHead>
                        {canManage ? <TableHead className="px-2">{t("Cost")}</TableHead> : null}
                        <TableHead className="px-2">{t("Stock")}</TableHead>
                        <TableHead className="px-2 text-end">{t("Actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.variants.map((variant) => {
                        const color = attributeValue(variant.attributes, "color");
                        const size = attributeValue(variant.attributes, "size");
                        return (
                          <TableRow key={variant.id}>
                            <TableCell className="max-w-[72px] truncate px-2 py-2.5 font-medium" title={color}>
                              {color}
                            </TableCell>
                            <TableCell className="max-w-[64px] truncate px-2 py-2.5" title={size}>
                              {size}
                            </TableCell>
                            <TableCell
                              className="max-w-[110px] truncate px-2 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400"
                              title={variant.sku}
                            >
                              {variant.sku}
                            </TableCell>
                            <TableCell className="px-2 py-2.5 whitespace-nowrap tabular-nums">
                              {formatPrice(variant.price, variant.currency)}
                            </TableCell>
                            {canManage ? (
                              <TableCell className="px-2 py-2.5 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                                {formatPrice(variant.cost)}
                              </TableCell>
                            ) : null}
                            <TableCell className="px-2 py-2">
                              <StockStepper
                                key={`${variant.id}:${variant.stock}`}
                                variantId={variant.id}
                                stock={variant.stock}
                                canManage={canManage}
                                onSaved={onMutate}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-2 text-end">
                              <div className="flex items-center justify-end gap-0.5">
                                <VariantPrintButton
                                  variant={{
                                    sku: variant.sku,
                                    productName: product.name,
                                    color: color === "—" ? "" : color,
                                    size: size === "—" ? "" : size,
                                    price: variant.price,
                                    currency: variant.currency,
                                  }}
                                />
                                {canManage ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" aria-label={`More actions for ${variant.sku}`}>
                                        <MoreHorizontal className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          setEditingVariant({
                                            variantId: variant.id,
                                            productId: product.id,
                                            name: product.name,
                                            categoryName: product.category.name,
                                            color: color === "—" ? "" : color,
                                            size: size === "—" ? "" : size,
                                            price: variant.price,
                                            cost: variant.cost,
                                            status: (variant.status === "discontinued"
                                              ? "discontinued"
                                              : "active") as VariantStatus,
                                            imageUrl: product.imageUrl,
                                          })
                                        }
                                      >
                                        <Pencil className="size-3.5" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() =>
                                          setDeleteTarget({
                                            variantId: variant.id,
                                            productId: product.id,
                                            name: product.name,
                                            categoryName: product.category.name,
                                            color: color === "—" ? "" : color,
                                            size: size === "—" ? "" : size,
                                            price: variant.price,
                                            cost: variant.cost,
                                            status: (variant.status === "discontinued"
                                              ? "discontinued"
                                              : "active") as VariantStatus,
                                            imageUrl: product.imageUrl,
                                          })
                                        }
                                      >
                                        <Trash2 className="size-3.5" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SheetBody>

              <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
                <Button className="w-full" variant="outline" onClick={openPrintAll}>
                  <Printer className="size-4" />
                  Print all QR labels ({product.variants.length})
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {editingVariant ? (
        <ProductFormModal
          open
          onOpenChange={(next) => !next && setEditingVariant(null)}
          editing={editingVariant}
          onSuccess={onMutate}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
          title={`Delete this variant of "${deleteTarget.name}"?`}
          description="This removes the color/size variant from the catalog. If it has order or stock history, it's marked discontinued instead."
          onConfirm={handleDeleteConfirm}
        />
      ) : null}

      {printTarget ? <BatchLabelPrintView variants={printTarget} onClose={() => setPrintTarget(null)} /> : null}
    </>
  );
}
