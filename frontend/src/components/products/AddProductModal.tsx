"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { listCategories } from "@/lib/categories";
import { createQuickProduct, uploadProductImage } from "@/lib/products";
import { ProductImageInput } from "./ProductImageInput";

interface AddProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSuccess: () => void;
}

interface VariantRow {
  key: string;
  color: string;
  size: string;
  price: string;
  cost: string;
  initialStock: string;
}

interface VariantRowErrors {
  color?: string;
  size?: string;
  price?: string;
  cost?: string;
  initialStock?: string;
}

let rowKeySeq = 0;
function newVariantRow(): VariantRow {
  rowKeySeq += 1;
  return { key: `row-${rowKeySeq}`, color: "", size: "", price: "", cost: "", initialStock: "0" };
}

export function AddProductModal({ open, onOpenChange, brandId, onSuccess }: AddProductModalProps) {
  const { t } = useLocale();
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [category, setCategory] = useState("");
  const [imageUrlText, setImageUrlText] = useState("");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<VariantRow[]>(() => [newVariantRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, VariantRowErrors>>({});
  const [submitting, setSubmitting] = useState(false);

  // Object URL for the staged file's live preview, recomputed whenever the
  // file changes. The effect below only revokes it on cleanup — it doesn't
  // call setState, so this isn't the "setState synchronously in an effect"
  // pattern this codebase's lint config flags.
  const stagedPreviewUrl = useMemo(() => (stagedFile ? URL.createObjectURL(stagedFile) : null), [stagedFile]);
  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    };
  }, [stagedPreviewUrl]);

  const imagePreviewUrl = stagedPreviewUrl ?? (imageUrlText.trim() || null);

  function handleImageUrlChange(value: string) {
    setImageUrlText(value);
    if (value) setStagedFile(null);
  }

  function handleImageFileSelect(file: File | null) {
    setStagedFile(file);
    if (file) setImageUrlText("");
  }

  function updateRow(key: string, field: keyof Omit<VariantRow, "key">, value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    setRowErrors((prev) => ({ ...prev, [key]: { ...prev[key], [field]: undefined } }));
  }

  function addRow() {
    setRows((prev) => [...prev, newVariantRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  // Validation messages are stored already-translated: they're only ever
  // rendered, never compared, and resolving them here keeps the JSX from
  // having to t() every individual error slot.
  function validate(): boolean {
    let ok = true;

    if (!name.trim()) {
      setNameError(t("Product name is required"));
      ok = false;
    } else {
      setNameError(undefined);
    }

    const nextRowErrors: Record<string, VariantRowErrors> = {};
    const seenCombos = new Set<string>();
    for (const row of rows) {
      const errors: VariantRowErrors = {};
      if (!row.color.trim()) errors.color = t("Required");
      if (!row.size.trim()) errors.size = t("Required");

      const price = Number(row.price);
      if (!row.price.trim() || Number.isNaN(price) || price <= 0) errors.price = t("Enter a price > 0");

      if (row.cost.trim()) {
        const cost = Number(row.cost);
        if (Number.isNaN(cost) || cost < 0) errors.cost = t("Cost can't be negative");
      }

      const stock = Number(row.initialStock);
      if (row.initialStock.trim() === "" || Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        errors.initialStock = t("Whole number, 0+");
      }

      const combo = `${row.color.trim().toLowerCase()}|${row.size.trim().toLowerCase()}`;
      if (row.color.trim() && row.size.trim()) {
        if (seenCombos.has(combo)) errors.size = t("Duplicate color/size combination");
        seenCombos.add(combo);
      }

      if (Object.keys(errors).length > 0) {
        nextRowErrors[row.key] = errors;
        ok = false;
      }
    }
    setRowErrors(nextRowErrors);

    return ok;
  }

  function resetForm() {
    setName("");
    setNameError(undefined);
    setCategory("");
    setImageUrlText("");
    setStagedFile(null);
    setRows([newVariantRow()]);
    setRowErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await createQuickProduct({
        brandId,
        name: name.trim(),
        category: category.trim() || undefined,
        imageUrl: imageUrlText.trim() || undefined,
        variants: rows.map((row) => ({
          color: row.color.trim(),
          size: row.size.trim(),
          price: Number(row.price),
          cost: row.cost.trim() ? Number(row.cost) : undefined,
          initialStock: Number(row.initialStock),
        })),
      });

      // The upload endpoint needs a real productId, which only exists after
      // the product itself was created above — so a staged file is a second
      // call, not part of the create payload (unlike a typed URL, which
      // goes straight in above).
      if (stagedFile) {
        try {
          await uploadProductImage(result.productId, stagedFile);
        } catch (imageErr) {
          toast.error(
            imageErr instanceof ApiError
              ? `${t("Product created, but the image upload failed")}: ${imageErr.message}`
              : t("Product created, but the image upload failed"),
          );
        }
      }

      toast.success(
        `${t("Product created with")} ${result.variants.length} ${t(result.variants.length === 1 ? "variant" : "variants")}`,
      );
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-w-3xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Add new product")}</DialogTitle>
            <DialogDescription>
              {t("Enter the product details, then add a color, size, and price for each variant.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="add-product-name">{t("Product Name")}</Label>
              <Input
                id="add-product-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
                placeholder={t("e.g. Princess Abaya")}
                disabled={submitting}
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="add-product-category">{t("Category")}</Label>
              <Input
                id="add-product-category"
                list="add-product-category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("e.g. Abayas / Scarves")}
                disabled={submitting}
              />
              <datalist id="add-product-category-options">
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("Leave empty to use General.")}</p>
            </div>
          </div>

          <ProductImageInput
            previewUrl={imagePreviewUrl}
            urlValue={imageUrlText}
            onUrlChange={handleImageUrlChange}
            onFileSelect={handleImageFileSelect}
            disabled={submitting}
          />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>{t("Variants & Colors")}</Label>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {rows.length} {t(rows.length === 1 ? "variant" : "variants")}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={submitting}>
                <Plus className="size-3.5" />
                {t("Add another variant")}
              </Button>
            </div>

            {/* No inner max-height/overflow here on purpose: DialogContent
                already scrolls at 90vh, and nesting a second scroll area
                produced two competing scrollbars on tall variant lists. */}
            <div className="flex flex-col gap-2.5">
              {rows.map((row, index) => {
                const errors = rowErrors[row.key] ?? {};
                return (
                  <div
                    key={row.key}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {t("Variant")} {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        onClick={() => removeRow(row.key)}
                        disabled={submitting || rows.length === 1}
                        aria-label={t("Remove variant")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                      <VariantField label={t("Color")} error={errors.color}>
                        <Input
                          value={row.color}
                          onChange={(e) => updateRow(row.key, "color", e.target.value)}
                          placeholder={t("e.g. white")}
                          disabled={submitting}
                          aria-invalid={Boolean(errors.color)}
                          aria-label={t("Color")}
                          className="h-8 bg-white dark:bg-slate-950"
                        />
                      </VariantField>

                      <VariantField label={t("Size")} error={errors.size}>
                        <Input
                          value={row.size}
                          onChange={(e) => updateRow(row.key, "size", e.target.value)}
                          placeholder="M"
                          disabled={submitting}
                          aria-invalid={Boolean(errors.size)}
                          aria-label={t("Size")}
                          className="h-8 bg-white dark:bg-slate-950"
                        />
                      </VariantField>

                      <VariantField label={t("Stock")} error={errors.initialStock}>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.initialStock}
                          onChange={(e) => updateRow(row.key, "initialStock", e.target.value)}
                          disabled={submitting}
                          aria-invalid={Boolean(errors.initialStock)}
                          aria-label={t("Stock")}
                          className="h-8 bg-white dark:bg-slate-950"
                        />
                      </VariantField>

                      <VariantField label={t("Production cost")} error={errors.cost}>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.cost}
                          onChange={(e) => updateRow(row.key, "cost", e.target.value)}
                          placeholder={t("Optional")}
                          disabled={submitting}
                          aria-invalid={Boolean(errors.cost)}
                          aria-label={t("Production cost")}
                          className="h-8 bg-white dark:bg-slate-950"
                        />
                      </VariantField>

                      <VariantField label={t("Price")} error={errors.price}>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.price}
                          onChange={(e) => updateRow(row.key, "price", e.target.value)}
                          placeholder="0.00"
                          disabled={submitting}
                          aria-invalid={Boolean(errors.price)}
                          aria-label={t("Price")}
                          className="h-8 bg-white dark:bg-slate-950"
                        />
                      </VariantField>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Add product")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One labelled cell inside a variant card — keeps the five inputs on a shared baseline whether or not they carry an error message. */
function VariantField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
