"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/apiClient";
import { listCategories } from "@/lib/categories";
import { bulkUpdateProductsCategory } from "@/lib/products";

interface BulkCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: string[];
  onSuccess: () => void;
}

/** The products table's bulk-select "Set Category" action — same free-text + autocomplete pattern as the drawer's category editor, applied to every selected product at once. */
export function BulkCategoryModal({ open, onOpenChange, productIds, onSuccess }: BulkCategoryModalProps) {
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = category.trim();
    if (!name) {
      setError("Category is required");
      return;
    }

    setSubmitting(true);
    try {
      const result = await bulkUpdateProductsCategory(productIds, name);
      toast.success(`${result.updatedCount} product${result.updatedCount === 1 ? "" : "s"} moved to "${result.categoryName}"`);
      onSuccess();
      onOpenChange(false);
      setCategory("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update category");
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
        if (!next) {
          setCategory("");
          setError(undefined);
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Set category</DialogTitle>
            <DialogDescription>
              Applies to {productIds.length} selected product{productIds.length === 1 ? "" : "s"}. Type an existing category or a
              new one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-category">Category</Label>
            <Input
              id="bulk-category"
              list="bulk-category-options"
              autoFocus
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setError(undefined);
              }}
              placeholder="e.g. Abayas"
              disabled={submitting}
              aria-invalid={Boolean(error)}
            />
            <datalist id="bulk-category-options">
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
