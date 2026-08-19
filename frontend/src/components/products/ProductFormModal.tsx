"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
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
import { Select } from "@/components/ui/select";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { listCategories } from "@/lib/categories";
import { updateProductCategory, updateProductVariant, uploadProductImage } from "@/lib/products";
import { resolveImageUrl } from "@/lib/images";
import type { VariantStatus } from "@/lib/types";
import { ProductImageInput } from "./ProductImageInput";

export interface EditableVariant {
  variantId: string;
  productId: string;
  name: string;
  categoryName: string;
  color: string;
  size: string;
  price: number | null;
  cost: number | null;
  status: VariantStatus;
  imageUrl: string | null;
}

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The variant being edited — pre-fills the form. */
  editing: EditableVariant;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  category: string;
  color: string;
  size: string;
  price: string;
  cost: string;
  status: VariantStatus;
}

function formStateFor(editing: EditableVariant): FormState {
  return {
    name: editing.name,
    category: editing.categoryName,
    color: editing.color,
    size: editing.size,
    price: editing.price != null ? String(editing.price) : "",
    cost: editing.cost != null ? String(editing.cost) : "",
    status: editing.status,
  };
}

/** Edits one existing variant's name/category/color/size/price/status/image. Creating new products/variants is AddProductModal's job, not this component's. */
export function ProductFormModal({ open, onOpenChange, editing, onSuccess }: ProductFormModalProps) {
  const { t } = useLocale();
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const [form, setForm] = useState<FormState>(() => formStateFor(editing));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [imageUrlText, setImageUrlText] = useState(() => editing.imageUrl ?? "");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
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

  // resolveImageUrl handles both cases uniformly: the pre-filled relative
  // upload path (needs the backend origin prefixed) and a freshly typed
  // absolute external URL (passed through unchanged).
  const imagePreviewUrl = stagedPreviewUrl ?? resolveImageUrl(imageUrlText.trim() || null);

  function handleImageUrlChange(value: string) {
    setImageUrlText(value);
    if (value) setStagedFile(null);
  }

  function handleImageFileSelect(file: File | null) {
    setStagedFile(file);
    if (file) setImageUrlText("");
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) next.name = t("Product name is required");
    if (!form.category.trim()) next.category = t("Category is required");
    if (!form.color.trim()) next.color = t("Color is required");
    if (!form.size.trim()) next.size = t("Size is required");

    const price = Number(form.price);
    if (!form.price.trim() || Number.isNaN(price) || price <= 0) next.price = t("Enter a price > 0");

    if (form.cost.trim()) {
      const cost = Number(form.cost);
      if (Number.isNaN(cost) || cost < 0) next.cost = t("Cost can't be negative");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // A staged file uploads (and persists) via its own endpoint since it
      // needs to send raw bytes, not JSON — the plain PATCH below only
      // carries imageUrl when there's no file, so the two paths can't
      // race/overwrite each other.
      if (stagedFile) {
        await uploadProductImage(editing.productId, stagedFile);
      }
      const trimmedCategory = form.category.trim();
      await Promise.all([
        updateProductVariant(editing.variantId, {
          name: form.name.trim(),
          color: form.color.trim(),
          size: form.size.trim(),
          price: Number(form.price),
          ...(form.cost.trim() ? { cost: Number(form.cost) } : {}),
          status: form.status,
          ...(stagedFile ? {} : { imageUrl: imageUrlText.trim() }),
        }),
        // Category applies to the whole product (every variant), same as
        // ProductCategorySelect — only sent when it actually changed, since
        // the backend treats an update as "set to this value", not a no-op.
        trimmedCategory !== editing.categoryName ? updateProductCategory(editing.productId, trimmedCategory) : null,
      ]);
      toast.success(t("Product updated"));
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Edit product")}</DialogTitle>
            <DialogDescription>
              {t("Price and cost changes apply to every color and size of this product, not just this variant.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="product-name">{t("Product Name")}</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder={t("e.g. Princess Abaya")}
                disabled={submitting}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="product-category">{t("Category")}</Label>
              <Input
                id="product-category"
                list="product-category-options"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder={t("e.g. Abayas / Scarves")}
                disabled={submitting}
                aria-invalid={Boolean(errors.category)}
              />
              <datalist id="product-category-options">
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {errors.category ? <p className="text-xs text-red-600 dark:text-red-400">{errors.category}</p> : null}
            </div>
          </div>

          <ProductImageInput
            previewUrl={imagePreviewUrl}
            urlValue={imageUrlText}
            onUrlChange={handleImageUrlChange}
            onFileSelect={handleImageFileSelect}
            disabled={submitting}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-color">{t("Color")}</Label>
              <Input
                id="product-color"
                value={form.color}
                onChange={(e) => setField("color", e.target.value)}
                placeholder={t("e.g. white")}
                disabled={submitting}
                aria-invalid={Boolean(errors.color)}
              />
              {errors.color ? <p className="text-xs text-red-600 dark:text-red-400">{errors.color}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-size">{t("Size")}</Label>
              <Input
                id="product-size"
                value={form.size}
                onChange={(e) => setField("size", e.target.value)}
                placeholder="M"
                disabled={submitting}
                aria-invalid={Boolean(errors.size)}
              />
              {errors.size ? <p className="text-xs text-red-600 dark:text-red-400">{errors.size}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-price">{t("Price")} (EGP)</Label>
              <Input
                id="product-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setField("price", e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                aria-invalid={Boolean(errors.price)}
              />
              {errors.price ? <p className="text-xs text-red-600 dark:text-red-400">{errors.price}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-cost">{t("Production cost")} (EGP)</Label>
              <Input
                id="product-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setField("cost", e.target.value)}
                placeholder={t("Optional")}
                disabled={submitting}
                aria-invalid={Boolean(errors.cost)}
              />
              {errors.cost ? <p className="text-xs text-red-600 dark:text-red-400">{errors.cost}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-status">{t("Status")}</Label>
            <Select
              id="product-status"
              value={form.status}
              onChange={(e) => setField("status", e.target.value as VariantStatus)}
              disabled={submitting}
            >
              <option value="active">{t("Active")}</option>
              <option value="discontinued">{t("Discontinued")}</option>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
