"use client";

import { useState, type FormEvent } from "react";
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
import { addVariantToProduct } from "@/lib/products";
import { attributeValue } from "@/lib/variantAttributes";
import type { Product } from "@/lib/types";

interface AddVariantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  onSuccess: () => void;
}

interface FormState {
  color: string;
  size: string;
  price: string;
  cost: string;
  initialStock: string;
}

function blankForm(product: Product): FormState {
  // Pre-fill price (and cost, if uniform) from the product's existing
  // variants — the common case is a new size/color at the same price, not a
  // one-off, so starting blank would just mean retyping the same number.
  const priced = product.variants.filter((v) => v.price != null);
  const price = priced.length > 0 ? String(priced[0]!.price) : "";
  const costed = product.variants.filter((v) => v.cost != null);
  const cost = costed.length > 0 && costed.every((v) => v.cost === costed[0]!.cost) ? String(costed[0]!.cost) : "";
  return { color: "", size: "", price, cost, initialStock: "0" };
}

/**
 * Adds one new color/size combination to this specific, already-open
 * product — POST /api/products/:productId/variants, keyed by id rather than
 * the "+ Add Product" modal's (brandId, name) lookup. Matching by name here
 * would be a real race condition (edit the product's name, then add a
 * variant before the drawer's data refetches, and the stale name matches
 * nothing — silently creating an orphaned duplicate product instead of
 * attaching to this one), so the backend has its own id-scoped endpoint for
 * this case. The SKU/QR-code generation and price/cost/initial-stock
 * inserts are still the same underlying logic as "Add Product"'s.
 */
export function AddVariantModal({ open, onOpenChange, product, onSuccess }: AddVariantModalProps) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(() => blankForm(product));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const [seededFor, setSeededFor] = useState(product.id);
  if (open && seededFor !== product.id) {
    setForm(blankForm(product));
    setErrors({});
    setSeededFor(product.id);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function resetForm() {
    setForm(blankForm(product));
    setErrors({});
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.color.trim()) next.color = t("Required");
    if (!form.size.trim()) next.size = t("Required");

    const price = Number(form.price);
    if (!form.price.trim() || Number.isNaN(price) || price <= 0) next.price = t("Enter a price > 0");

    if (form.cost.trim()) {
      const cost = Number(form.cost);
      if (Number.isNaN(cost) || cost < 0) next.cost = t("Cost can't be negative");
    }

    const stock = Number(form.initialStock);
    if (form.initialStock.trim() === "" || Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      next.initialStock = t("Whole number, 0+");
    }

    // Guard against creating a genuine duplicate variant: the backend's
    // get-or-create-by-name only dedupes the *product*, not the variant, so
    // resubmitting an existing color/size combo would silently add a second,
    // identical variant rather than erroring.
    if (form.color.trim() && form.size.trim()) {
      const newColor = form.color.trim().toLowerCase();
      const newSize = form.size.trim().toLowerCase();
      const alreadyExists = product.variants.some(
        (v) =>
          attributeValue(v.attributes, "color").toLowerCase() === newColor &&
          attributeValue(v.attributes, "size").toLowerCase() === newSize,
      );
      if (alreadyExists) next.size = t("This color/size combination already exists");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await addVariantToProduct(product.id, {
        color: form.color.trim(),
        size: form.size.trim(),
        price: Number(form.price),
        cost: form.cost.trim() ? Number(form.cost) : undefined,
        initialStock: Number(form.initialStock),
      });

      toast.success(t("Variant added"));
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
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Add variant")}</DialogTitle>
            <DialogDescription>
              {t("A new color/size combination for")} {product.name}
              {" — "}
              {t("the SKU and barcode are generated automatically.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-variant-color">{t("Color")}</Label>
              <Input
                id="add-variant-color"
                value={form.color}
                onChange={(e) => setField("color", e.target.value)}
                placeholder={t("e.g. white")}
                disabled={submitting}
                aria-invalid={Boolean(errors.color)}
              />
              {errors.color ? <p className="text-xs text-red-600 dark:text-red-400">{errors.color}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-variant-size">{t("Size")}</Label>
              <Input
                id="add-variant-size"
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
              <Label htmlFor="add-variant-price">{t("Price")} (EGP)</Label>
              <Input
                id="add-variant-price"
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
              <Label htmlFor="add-variant-cost">{t("Production cost")} (EGP)</Label>
              <Input
                id="add-variant-cost"
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
            <Label htmlFor="add-variant-stock">{t("Initial stock")}</Label>
            <Input
              id="add-variant-stock"
              type="number"
              min="0"
              step="1"
              value={form.initialStock}
              onChange={(e) => setField("initialStock", e.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errors.initialStock)}
              className="max-w-[10rem]"
            />
            {errors.initialStock ? <p className="text-xs text-red-600 dark:text-red-400">{errors.initialStock}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Add variant")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
