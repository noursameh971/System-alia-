"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/apiClient";
import { listCategories } from "@/lib/categories";
import { updateProductCategory } from "@/lib/products";

const NEW_CATEGORY_VALUE = "__new__";

interface ProductCategorySelectProps {
  productId: string;
  categoryName: string;
  canManage: boolean;
  onSaved: () => void;
  /** "badge" (default) for the table row's compact pill; "plain" for the drawer header's larger label. */
  display?: "badge" | "plain";
}

/**
 * Click-to-edit category control shared by the products table's Category
 * column and the Product Profile drawer's header — picking an existing
 * category from the dropdown applies immediately (no separate save step);
 * choosing "+ Add new category" swaps in a text field for a brand-new name.
 * Both paths write through updateProductCategory, which get-or-creates the
 * category and sets it on the product row, so every variant of the product
 * picks it up automatically.
 */
export function ProductCategorySelect({
  productId,
  categoryName,
  canManage,
  onSaved,
  display = "badge",
}: ProductCategorySelectProps) {
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const [editing, setEditing] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEditing(e: MouseEvent) {
    e.stopPropagation(); // rows/headers this sits in often have their own onClick (e.g. opening the drawer)
    setAddingNew(false);
    setNewValue("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setAddingNew(false);
    setNewValue("");
  }

  async function apply(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === categoryName) {
      cancel();
      return;
    }

    setSaving(true);
    try {
      const result = await updateProductCategory(productId, trimmed);
      toast.success(`Category set to "${result.categoryName}"`);
      onSaved();
      cancel();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  function handleSelectChange(value: string) {
    if (value === NEW_CATEGORY_VALUE) {
      setAddingNew(true);
      return;
    }
    void apply(value);
  }

  function handleNewValueKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void apply(newValue);
    if (e.key === "Escape") cancel();
  }

  const label =
    display === "badge" ? (
      <Badge variant="neutral">{categoryName}</Badge>
    ) : (
      <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{categoryName}</span>
    );

  if (!canManage) return label;

  if (!editing) {
    return (
      <button type="button" onClick={startEditing} className="group inline-flex items-center gap-1">
        {label}
        <Pencil className="size-3 text-slate-400 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  if (addingNew) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleNewValueKeyDown}
          placeholder="New category name"
          disabled={saving}
          className="h-8 w-40"
          aria-label="New category name"
        />
        <Button type="button" size="icon" className="size-8" onClick={() => void apply(newValue)} disabled={saving}>
          <Check className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="outline" className="size-8" onClick={cancel} disabled={saving}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Select
        autoFocus
        value={categoryName}
        onChange={(e) => handleSelectChange(e.target.value)}
        disabled={saving}
        wrapperClassName="w-40"
        className="h-8"
        aria-label="Select category"
      >
        {(categories ?? []).map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CATEGORY_VALUE}>+ Add new category…</option>
      </Select>
      <Button type="button" size="icon" variant="outline" className="size-8" onClick={cancel} disabled={saving}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
