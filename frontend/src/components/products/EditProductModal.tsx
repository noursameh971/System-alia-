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
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { listCategories } from "@/lib/categories";
import { resolveImageUrl } from "@/lib/images";
import { updateProductCategory, updateProductCost, updateProductInfo, updateProductPrice, uploadProductImage } from "@/lib/products";
import type { Product } from "@/lib/types";
import { ProductImageInput } from "./ProductImageInput";

interface EditProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  /** The header's already-computed "current" price/cost — same values shown next to the inline editors, so the modal opens pre-filled with what's on screen rather than re-deriving it. */
  priceInfo: { price: number | null; currency: string | null };
  costInfo: { cost: number | null };
  onSuccess: () => void;
}

interface FormState {
  name: string;
  category: string;
  price: string;
  cost: string;
}

function formStateFor(product: Product, priceInfo: EditProductModalProps["priceInfo"], costInfo: EditProductModalProps["costInfo"]): FormState {
  return {
    name: product.name,
    category: product.category.name,
    price: priceInfo.price != null ? String(priceInfo.price) : "",
    cost: costInfo.cost != null ? String(costInfo.cost) : "",
  };
}

/**
 * Product-level "edit everything" form — name, image, category, price, and
 * production cost. Deliberately no color/size/status here (those are
 * per-variant, edited from that variant's own row in the table); this is
 * the counterpart for the fields that describe the product as a whole.
 *
 * Price/category/cost already have working single-field inline editors
 * elsewhere in the drawer header — this modal doesn't replace them, it's
 * just a second, more discoverable place to reach the same actions (plus
 * name/image, which had no editor at all before this).
 */
export function EditProductModal({ open, onOpenChange, product, priceInfo, costInfo, onSuccess }: EditProductModalProps) {
  const { t } = useLocale();
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const [form, setForm] = useState<FormState>(() => formStateFor(product, priceInfo, costInfo));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [imageUrlText, setImageUrlText] = useState(() => product.imageUrl ?? "");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed whenever the modal is opened for a (possibly different, possibly
  // updated) product — React's documented "reset state when a prop changes"
  // pattern, since this component stays mounted (inside ProductProfileDrawer)
  // rather than remounting fresh each time it opens.
  const [seededFor, setSeededFor] = useState(product.id);
  if (open && seededFor !== product.id) {
    setForm(formStateFor(product, priceInfo, costInfo));
    setImageUrlText(product.imageUrl ?? "");
    setStagedFile(null);
    setErrors({});
    setSeededFor(product.id);
  }

  const stagedPreviewUrl = useMemo(() => (stagedFile ? URL.createObjectURL(stagedFile) : null), [stagedFile]);
  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    };
  }, [stagedPreviewUrl]);

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
      // needs to send raw bytes, not JSON — updateProductInfo's imageUrl
      // field only carries a typed/pasted URL, so the two paths can't
      // race/overwrite each other.
      if (stagedFile) {
        await uploadProductImage(product.id, stagedFile);
      }

      const trimmedName = form.name.trim();
      const trimmedCategory = form.category.trim();
      const trimmedImageUrl = imageUrlText.trim();
      const nameChanged = trimmedName !== product.name;
      const imageUrlChanged = !stagedFile && trimmedImageUrl !== (product.imageUrl ?? "");
      const price = Number(form.price);
      const cost = form.cost.trim() ? Number(form.cost) : null;

      await Promise.all([
        nameChanged || imageUrlChanged
          ? updateProductInfo(product.id, {
              ...(nameChanged ? { name: trimmedName } : {}),
              ...(imageUrlChanged ? { imageUrl: trimmedImageUrl } : {}),
            })
          : null,
        trimmedCategory !== product.category.name ? updateProductCategory(product.id, trimmedCategory) : null,
        price !== priceInfo.price ? updateProductPrice(product.id, price) : null,
        cost !== null && cost !== costInfo.cost ? updateProductCost(product.id, cost) : null,
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
              {t("Name, image, category, price, and production cost — applies to the whole product, every color and size.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="edit-product-name">{t("Product Name")}</Label>
              <Input
                id="edit-product-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder={t("e.g. Princess Abaya")}
                disabled={submitting}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="edit-product-category">{t("Category")}</Label>
              <Input
                id="edit-product-category"
                list="edit-product-category-options"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder={t("e.g. Abayas / Scarves")}
                disabled={submitting}
                aria-invalid={Boolean(errors.category)}
              />
              <datalist id="edit-product-category-options">
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
              <Label htmlFor="edit-product-price">{t("Price")} (EGP)</Label>
              <Input
                id="edit-product-price"
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
              <Label htmlFor="edit-product-cost">{t("Production cost")} (EGP)</Label>
              <Input
                id="edit-product-cost"
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

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("Price and cost changes apply to every color and size of this product.")}
          </p>

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
