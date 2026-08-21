"use client";

import { useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
          >
            {submitting ? t("Deleting...") : (confirmLabel ?? t("Delete"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
