"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { createWorkOrder, listBoms, listFinishedGoods, listProductionLines, listWorkOrders } from "@/lib/factory";
import type { WorkOrderPriority } from "@/lib/factoryTypes";
import { useLocale } from "@/context/LocaleContext";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "warning",
  paused: "warning",
  completed: "success",
  cancelled: "danger",
};

export default function WorkOrdersPage() {
  const { t } = useLocale();
  const { data: workOrders, isLoading, error, mutate } = useSWR("factory-work-orders", () => listWorkOrders());
  const [creating, setCreating] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Work Orders")}</h2>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          {t("New Work Order")}
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner label="Loading work orders..." />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load work orders" description={error instanceof ApiError ? error.message : undefined} />
        ) : !workOrders || workOrders.length === 0 ? (
          <EmptyState
            title={t("No work orders yet")}
            description={t("Create a work order from a Bill of Materials to start production.")}
            action={
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                {t("New Work Order")}
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("Order #")}</TableHead>
                  <TableHead>{t("Finished Good")}</TableHead>
                  <TableHead>{t("Qty")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Priority")}</TableHead>
                  <TableHead>{t("Line")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo) => (
                  <TableRow key={wo.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs font-medium">
                      <Link href={`/factory/work-orders/${wo.id}`} className="hover:underline">
                        {wo.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{wo.finishedGoodName}</TableCell>
                    <TableCell className="tabular-nums">
                      {wo.quantityCompleted}/{wo.quantityOrdered}
                      {wo.quantityScrapped > 0 ? <span className="ms-1 text-xs text-rose-500">(-{wo.quantityScrapped})</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[wo.status] ?? "neutral"} size="sm">
                        {t(wo.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{t(wo.priority)}</TableCell>
                    <TableCell>{wo.lineName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {creating ? <CreateWorkOrderModal open={creating} onOpenChange={setCreating} onSuccess={() => void mutate()} /> : null}
    </section>
  );
}

function CreateWorkOrderModal({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const { t } = useLocale();
  const { data: finishedGoods } = useSWR("factory-finished-goods", listFinishedGoods);
  const { data: lines } = useSWR("factory-production-lines", listProductionLines);

  const [finishedGoodId, setFinishedGoodId] = useState("");
  const { data: boms } = useSWR(finishedGoodId ? ["factory-boms-for", finishedGoodId] : null, () => listBoms(finishedGoodId));
  const [bomId, setBomId] = useState("");
  const [quantityOrdered, setQuantityOrdered] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [lineId, setLineId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeBoms = (boms ?? []).filter((b) => b.status !== "archived");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!finishedGoodId || !bomId || !quantityOrdered.trim()) return;

    setSubmitting(true);
    try {
      const result = await createWorkOrder({
        finishedGoodId,
        bomId,
        quantityOrdered: Number(quantityOrdered),
        priority,
        lineId: lineId || undefined,
      });
      toast.success(`${t("Work order created")}: ${result.orderNumber}`);
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
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("New Work Order")}</DialogTitle>
            <DialogDescription>{t("Plans production of a finished good against one of its active Bills of Materials.")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wo-finished-good">{t("Finished Good")}</Label>
            <Select
              id="wo-finished-good"
              value={finishedGoodId}
              onChange={(e) => {
                setFinishedGoodId(e.target.value);
                setBomId("");
              }}
              disabled={submitting}
            >
              <option value="">{t("Select a finished good")}</option>
              {(finishedGoods ?? []).map((fg) => (
                <option key={fg.id} value={fg.id}>
                  {fg.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wo-bom">{t("Bill of Materials")}</Label>
            <Select id="wo-bom" value={bomId} onChange={(e) => setBomId(e.target.value)} disabled={submitting || !finishedGoodId}>
              <option value="">{t("Select a BOM")}</option>
              {activeBoms.map((b) => (
                <option key={b.id} value={b.id}>
                  v{b.version} {b.label ? `— ${b.label}` : ""} ({t(b.status)})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wo-quantity">{t("Quantity")}</Label>
              <Input id="wo-quantity" type="number" min="0.001" step="0.001" value={quantityOrdered} onChange={(e) => setQuantityOrdered(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wo-priority">{t("Priority")}</Label>
              <Select id="wo-priority" value={priority} onChange={(e) => setPriority(e.target.value as WorkOrderPriority)} disabled={submitting}>
                <option value="low">{t("low")}</option>
                <option value="normal">{t("normal")}</option>
                <option value="high">{t("high")}</option>
                <option value="urgent">{t("urgent")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wo-line">{t("Line")}</Label>
              <Select id="wo-line" value={lineId} onChange={(e) => setLineId(e.target.value)} disabled={submitting}>
                <option value="">{t("Unassigned")}</option>
                {(lines ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !finishedGoodId || !bomId || !quantityOrdered.trim()}>
              {submitting ? t("Saving...") : t("Create Work Order")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
