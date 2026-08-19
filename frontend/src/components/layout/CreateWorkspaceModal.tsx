"use client";

import { useState, type FormEvent } from "react";
import { mutate as globalMutate } from "swr";
import { useRouter } from "next/navigation";
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
import { ApiError } from "@/lib/apiClient";
import { workspaceHomePath } from "@/lib/routing";
import { createBrand } from "@/lib/brands";

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CODE_PATTERN = /^[A-Za-z0-9]{2,10}$/;

/** Strips to letters/numbers, uppercases, and caps at the code column's 10-char limit — e.g. "Noori" -> "NOORI", "Alia Hijab" -> "ALIAHIJAB". */
function deriveCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

/**
 * Creates a new brand with the exact same tools every existing workspace
 * has — Products, Inventory, Orders, its own /[brand]/dashboard — since
 * categories, warehouses, and attributes are all global and lazily
 * get-or-created on first use (see backend brands.service.ts), a new
 * workspace needs no setup beyond this one form.
 */
export function CreateWorkspaceModal({ open, onOpenChange }: CreateWorkspaceModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  // Once the user edits the code field directly, typing in the name field
  // stops overwriting it — otherwise a manual customization would keep
  // getting clobbered on every keystroke in Name.
  const [codeTouched, setCodeTouched] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setCode("");
    setCodeTouched(false);
    setErrors({});
  }

  function validate(): boolean {
    const next: { name?: string; code?: string } = {};
    if (!name.trim()) next.name = "Workspace name is required";
    if (!CODE_PATTERN.test(code.trim())) next.code = "2-10 letters or numbers";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await createBrand({ name: name.trim(), code: code.trim() });
      toast.success(`Workspace "${created.name}" created`);
      void globalMutate("brands");
      onOpenChange(false);
      resetForm();
      router.push(workspaceHomePath(created.code));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create workspace");
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
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Creates a new brand with the same catalog, inventory, and order tools as every other workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                setErrors((prev) => ({ ...prev, name: undefined }));
                if (!codeTouched) setCode(deriveCode(next));
              }}
              placeholder="e.g. Noori"
              disabled={submitting}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-code">Workspace code</Label>
            <Input
              id="workspace-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeTouched(true);
                setErrors((prev) => ({ ...prev, code: undefined }));
              }}
              placeholder="e.g. NOORI"
              disabled={submitting}
              aria-invalid={Boolean(errors.code)}
              maxLength={10}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Auto-filled from the name — short code used in the workspace URL and its badge. Edit it to customize.
            </p>
            {errors.code ? <p className="text-xs text-red-600 dark:text-red-400">{errors.code}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
