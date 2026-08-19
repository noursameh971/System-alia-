"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useAllBins } from "@/hooks/useAllBins";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useLocale } from "@/context/LocaleContext";
import { recordBatchMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import type { BatchMovementInput, VariantLookupResult } from "@/lib/types";
import { VariantScanInput } from "./VariantScanInput";
import { BinSelect } from "./BinSelect";
import { MovementStatusBanner, type MovementStatus } from "./MovementStatusBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type MovementKind = "inbound" | "outbound" | "transfer" | "return";

interface QueueItem {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
}

const KIND_COPY: Record<MovementKind, string> = {
  inbound: "Stock entering the warehouse (e.g. new purchase). Scan continuously — items queue up below.",
  outbound: "Stock leaving the warehouse (sale/shipping). Scan continuously — items queue up below.",
  transfer: "Move stock between bins. Scan continuously — items queue up below.",
  return: "Process returned stock — restock if salable, or log as damaged/lost. Scan continuously — items queue up below.",
};

const KIND_ACTION_LABEL: Record<MovementKind, string> = {
  inbound: "Receive",
  outbound: "Ship",
  transfer: "Transfer",
  return: "Process Return",
};

/**
 * The Inventory page's fast-scan WMS panel, shared by all four movement
 * tabs: a scanner that never stops (every resolved SKU is added straight to
 * a queue instead of opening a one-item form), inline +/- and delete on
 * each queued line, and a single "Execute Batch" call that processes the
 * whole queue in one backend transaction (POST /api/stock-movements/batch).
 */
export function ScanQueuePanel({ movementType, onExecuted }: { movementType: MovementKind; onExecuted: () => void }) {
  const { brand } = useWorkspace();
  const { bins } = useAllBins();
  const { t } = useLocale();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [fromBinId, setFromBinId] = useState("");
  const [toBinId, setToBinId] = useState("");
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [reason, setReason] = useState("");
  const [executing, setExecuting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  function addToQueue(variant: VariantLookupResult) {
    setStatus(null);
    setQueue((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id);
      if (existing) {
        return prev.map((item) => (item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      const attributesLabel = variant.attributes.map((a) => a.value).join(" / ");
      return [{ variantId: variant.id, sku: variant.sku, productName: variant.productName, attributesLabel, quantity: 1 }, ...prev];
    });
  }

  function adjustQuantity(variantId: string, delta: number) {
    setQueue((prev) =>
      prev
        .map((item) => (item.variantId === variantId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(variantId: string) {
    setQueue((prev) => prev.filter((item) => item.variantId !== variantId));
  }

  const totalUnits = queue.reduce((sum, item) => sum + item.quantity, 0);

  const bindOptions = bins.map((b) => ({ id: b.id, label: `${b.zoneCode} / ${b.code}` }));

  const contextReady =
    movementType === "inbound"
      ? Boolean(toBinId)
      : movementType === "outbound"
        ? Boolean(fromBinId)
        : movementType === "transfer"
          ? Boolean(fromBinId) && Boolean(toBinId) && fromBinId !== toBinId
          : condition === "damaged" || Boolean(toBinId);

  const canExecute = queue.length > 0 && contextReady && !executing;

  function buildPayload(): BatchMovementInput {
    const items = queue.map((item) => ({ variantId: item.variantId, quantity: item.quantity }));
    if (movementType === "inbound") return { movementType: "inbound", toBinId, items };
    if (movementType === "outbound") return { movementType: "outbound", fromBinId, items };
    if (movementType === "transfer") return { movementType: "transfer", fromBinId, toBinId, items };
    return {
      movementType: "return",
      condition,
      toBinId: condition === "good" ? toBinId : undefined,
      reason: reason.trim() || undefined,
      items,
    };
  }

  async function handleExecute() {
    if (!canExecute) return;
    setExecuting(true);
    setStatus(null);
    try {
      const result = await recordBatchMovement(buildPayload());
      toast.success(
        `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} processed — ${result.totalQuantity} unit${result.totalQuantity === 1 ? "" : "s"} total.`,
      );
      setQueue([]);
      setReason("");
      onExecuted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as { available?: number; requested?: number } | undefined;
        setStatus({
          kind: "error",
          message:
            details?.available !== undefined
              ? `Only ${details.available} available (requested ${details.requested}) — nothing in this batch was saved.`
              : `${err.message} — nothing in this batch was saved.`,
        });
      } else {
        setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Failed to execute batch" });
      }
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t(KIND_COPY[movementType])}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {movementType === "inbound" ? (
          <BinSelect label="Destination bin" value={toBinId} onChange={setToBinId} options={bindOptions} />
        ) : null}

        {movementType === "outbound" ? (
          <BinSelect label="Source bin" value={fromBinId} onChange={setFromBinId} options={bindOptions} />
        ) : null}

        {movementType === "transfer" ? (
          <>
            <BinSelect label="From bin" value={fromBinId} onChange={setFromBinId} options={bindOptions} />
            <BinSelect
              label="To bin"
              value={toBinId}
              onChange={setToBinId}
              options={bindOptions.filter((b) => b.id !== fromBinId)}
            />
          </>
        ) : null}

        {movementType === "return" ? (
          <>
            <div>
              <Label className="mb-1.5 block">{t("Item condition")}</Label>
              <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setCondition("good")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    condition === "good"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {t("Salable / Good")}
                </button>
                <button
                  type="button"
                  onClick={() => setCondition("damaged")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    condition === "damaged"
                      ? "bg-orange-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {t("Damaged / Lost")}
                </button>
              </div>
            </div>

            {condition === "good" ? (
              <BinSelect label="Restock bin" value={toBinId} onChange={setToBinId} options={bindOptions} />
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="return-reason">{t("Reason (optional)")}</Label>
                <Input
                  id="return-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. box crushed in transit"
                />
              </div>
            )}
          </>
        ) : null}
      </div>

      {movementType === "return" && condition === "damaged" ? (
        <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">
          {t("These items are logged to the Damaged/Lost audit trail and will not be added back to sellable stock.")}
        </p>
      ) : null}

      <VariantScanInput variant={null} onResolved={addToQueue} onClear={() => {}} expectedBrand={brand} />

      {queue.length === 0 ? (
        <EmptyState
          title={t("Scan to begin")}
          description={t("Scanned items queue up here — scan the same SKU again to bump its quantity.")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("Item")}</TableHead>
                <TableHead>{t("SKU")}</TableHead>
                <TableHead>{t("Qty")}</TableHead>
                <TableHead className="text-end">{t("Remove")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                    {item.productName}
                    {item.attributesLabel ? (
                      <div className="text-xs font-normal text-slate-500 dark:text-slate-400">{item.attributesLabel}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-7"
                        onClick={() => adjustQuantity(item.variantId, -1)}
                        aria-label={`Decrease quantity for ${item.sku}`}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-7"
                        onClick={() => adjustQuantity(item.variantId, 1)}
                        aria-label={`Increase quantity for ${item.sku}`}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(item.variantId)}
                      aria-label={`Remove ${item.sku} from queue`}
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MovementStatusBanner status={status} />

      <Button type="button" onClick={() => void handleExecute()} disabled={!canExecute} className="w-full py-3 text-sm">
        {executing
          ? t("Processing...")
          : queue.length > 0
            ? `${t("Execute Batch")} ${t(KIND_ACTION_LABEL[movementType])} (${queue.length} ${t(queue.length === 1 ? "item" : "items")}, ${totalUnits} ${t(totalUnits === 1 ? "unit" : "units")})`
            : t("Execute Batch Action")}
      </Button>
    </div>
  );
}
