"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAllBins } from "@/hooks/useAllBins";
import { recordInboundMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import type { LowStockItem } from "@/lib/types";
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

interface QuickRestockModalProps {
  /** The low-stock item being restocked, or null to keep the dialog closed. */
  item: LowStockItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/** The Low Stock Warnings card's "+ Restock" action — a minimal inbound-movement form (bin + quantity) so a manager can top up a low-stock variant without leaving the dashboard. */
export function QuickRestockModal({ item, onOpenChange, onSuccess }: QuickRestockModalProps) {
  const { bins } = useAllBins();
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetAndClose() {
    setBinId("");
    setQuantity("");
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;

    if (!binId) {
      setError("Choose a bin");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Enter a whole number quantity greater than 0");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await recordInboundMovement({ variantId: item.variantId, binId, quantity: qty });
      toast.success(`Added ${qty} — now ${result.toBinQuantityAfter} on hand there.`);
      onSuccess();
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record restock");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) resetAndClose();
      }}
    >
      <DialogContent>
        {item ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Restock {item.productName}</DialogTitle>
              <DialogDescription>
                {[item.color, item.size].filter(Boolean).join(" / ") || item.sku} &middot; currently {item.stock} on hand
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restock-bin">Destination bin</Label>
              <Select
                id="restock-bin"
                value={binId}
                onChange={(e) => {
                  setBinId(e.target.value);
                  setError(null);
                }}
                disabled={submitting}
              >
                <option value="">Select a bin...</option>
                {bins.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.zoneCode} / {b.code}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restock-qty">Quantity</Label>
              <Input
                id="restock-qty"
                type="number"
                min="1"
                step="1"
                autoFocus
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError(null);
                }}
                placeholder="0"
                disabled={submitting}
              />
            </div>

            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetAndClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Recording..." : "Record Inbound"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
