"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { updateLedgerEntity, LEDGER_CATEGORY_META } from "@/lib/ledger";
import { ApiError } from "@/lib/apiClient";
import { LEDGER_ENTITY_CATEGORIES, type LedgerEntity, type LedgerEntityCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormState {
  name: string;
  category: LedgerEntityCategory;
  phone: string;
  notes: string;
}

function formFor(entity: LedgerEntity): FormState {
  return {
    name: entity.name,
    category: entity.category,
    phone: entity.phone ?? "",
    notes: entity.notes ?? "",
  };
}

/** "Edit Supplier Info" on the Supplier Detail page. balanceType (Payable/Receivable) isn't editable here — see updateLedgerEntitySchema's comment on why. */
export function EditSupplierModal({
  entity,
  onOpenChange,
  onSuccess,
}: {
  /** null closes the modal — same "the prop is the open state" pattern used across this module's modals. */
  entity: LedgerEntity | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(() => (entity ? formFor(entity) : { name: "", category: "other", phone: "", notes: "" }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const [seededFor, setSeededFor] = useState<string | null>(entity?.id ?? null);
  if (entity && seededFor !== entity.id) {
    setForm(formFor(entity));
    setErrors({});
    setSeededFor(entity.id);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = t("Entity/Supplier name is required");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entity || !validate()) return;

    setSubmitting(true);
    try {
      await updateLedgerEntity(entity.id, {
        name: form.name.trim(),
        category: form.category,
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      });
      toast.success(t("Supplier updated"));
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={entity !== null} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Edit Supplier Info")}</DialogTitle>
            <DialogDescription>{t("Category, contact, and notes — the payable/receivable direction can't be changed here.")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-name">{t("Entity/Supplier Name")}</Label>
            <Input
              id="supplier-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-category">{t("Category")}</Label>
              <Select
                id="supplier-category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value as LedgerEntityCategory)}
                disabled={submitting}
              >
                {LEDGER_ENTITY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(LEDGER_CATEGORY_META[category].label)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-phone">
                {t("Phone")} <span className="font-normal text-slate-400">({t("optional")})</span>
              </Label>
              {/* dir="ltr" so a phone number doesn't render with digits flipped in Arabic. */}
              <Input
                id="supplier-phone"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="01xxxxxxxxx"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <textarea
              id="supplier-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              disabled={submitting}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition-colors focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
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
