"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import {
  getWorkOrder,
  issueBomMaterials,
  listFactoryLocations,
  recordLabor,
  recordOutput,
  recordQualityCheck,
  updateWorkOrderStatus,
} from "@/lib/factory";
import type { WorkOrderStatus } from "@/lib/factoryTypes";
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

const NEXT_STATUS_ACTIONS: Record<WorkOrderStatus, { status: WorkOrderStatus; label: string }[]> = {
  draft: [{ status: "scheduled", label: "Schedule" }],
  scheduled: [{ status: "in_progress", label: "Start" }],
  in_progress: [
    { status: "paused", label: "Pause" },
    { status: "completed", label: "Complete" },
  ],
  paused: [{ status: "in_progress", label: "Resume" }],
  completed: [],
  cancelled: [],
};

export function WorkOrderDetail({ workOrderId }: { workOrderId: string }) {
  const { t } = useLocale();
  const { data: wo, error, isLoading, mutate } = useSWR(["factory-work-order", workOrderId], () => getWorkOrder(workOrderId));
  const [issuingMaterials, setIssuingMaterials] = useState(false);
  const [loggingLabor, setLoggingLabor] = useState(false);
  const [recordingOutput, setRecordingOutput] = useState(false);
  const [recordingQc, setRecordingQc] = useState(false);

  async function handleStatusChange(status: WorkOrderStatus) {
    try {
      await updateWorkOrderStatus(workOrderId, status);
      toast.success(t("Status updated"));
      void mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading work order..." />
      </div>
    );
  }

  if (error || !wo) {
    return <EmptyState title="Couldn't load this work order" description={error instanceof ApiError ? error.message : undefined} />;
  }

  const canIssueMaterials = wo.status !== "completed" && wo.status !== "cancelled";
  const canRecordActivity = wo.status === "in_progress" || wo.status === "paused";

  return (
    <>
      <Link href="/factory/work-orders" className="flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" />
        {t("Work Orders")}
      </Link>

      <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">{wo.orderNumber}</h2>
              <Badge variant={STATUS_VARIANT[wo.status] ?? "neutral"} size="sm">
                {t(wo.status)}
              </Badge>
              <Badge variant="neutral" size="sm" className="capitalize">
                {t(wo.priority)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {wo.finishedGoodName} · v{wo.bomVersion} {wo.lineName ? `· ${wo.lineName}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {NEXT_STATUS_ACTIONS[wo.status].map((action) => (
              <Button key={action.status} type="button" variant="outline" size="sm" onClick={() => void handleStatusChange(action.status)}>
                {t(action.label)}
              </Button>
            ))}
            {wo.status !== "completed" && wo.status !== "cancelled" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleStatusChange("cancelled")}>
                {t("Cancel")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="min-w-[140px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Ordered")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{wo.quantityOrdered}</p>
          </div>
          <div className="min-w-[140px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Completed")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{wo.quantityCompleted}</p>
          </div>
          <div className="min-w-[140px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Scrapped")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{wo.quantityScrapped}</p>
          </div>
        </div>

        {wo.stages.length > 0 ? (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Routing")}</p>
            <ol className="flex flex-wrap gap-2">
              {wo.stages.map((s, i) => (
                <li key={s.id} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {i + 1}. {t(s.stageName)}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{t("Material Requirements (MRP)")}</h3>
          {canIssueMaterials ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setIssuingMaterials(true)}>
              {t("Issue Materials")}
            </Button>
          ) : null}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("Material")}</TableHead>
                <TableHead>{t("Required")}</TableHead>
                <TableHead>{t("Available")}</TableHead>
                <TableHead>{t("Shortfall")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wo.materialRequirements.map((r) => (
                <TableRow key={r.materialId}>
                  <TableCell className="font-medium">{r.materialName}</TableCell>
                  <TableCell className="tabular-nums">
                    {r.requiredQuantity.toFixed(2)} {t(r.unit)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.availableQuantity.toFixed(2)} {t(r.unit)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.shortfall > 0 ? (
                      <Badge variant="danger" size="sm">
                        {r.shortfall.toFixed(2)} {t(r.unit)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">{t("Labor")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setLoggingLabor(true)} disabled={!canRecordActivity}>
              <Plus className="size-3.5" />
              {t("Log Labor")}
            </Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {wo.laborLogs.length === 0 ? (
              <p className="text-sm text-slate-400">{t("No labor logged yet.")}</p>
            ) : (
              wo.laborLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <span>{l.workerName}</span>
                  <span className="tabular-nums text-slate-500">
                    {l.hoursWorked} {t("hrs")} · {l.quantityProduced} {t("units")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">{t("Output & Scrap")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setRecordingOutput(true)} disabled={!canRecordActivity}>
              <Plus className="size-3.5" />
              {t("Record Output")}
            </Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {wo.outputLogs.length === 0 ? (
              <p className="text-sm text-slate-400">{t("No output recorded yet.")}</p>
            ) : (
              wo.outputLogs.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400">+{o.quantityGood} {t("good")}</span>
                  {o.quantityScrap > 0 ? (
                    <span className="tabular-nums text-rose-600 dark:text-rose-400">
                      -{o.quantityScrap} {t("scrap")} {o.scrapReason ? `(${o.scrapReason})` : ""}
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{t("Quality Checks")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setRecordingQc(true)} disabled={!canRecordActivity}>
            <Plus className="size-3.5" />
            {t("Record QC")}
          </Button>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {wo.qualityChecks.length === 0 ? (
            <p className="text-sm text-slate-400">{t("No quality checks recorded yet.")}</p>
          ) : (
            wo.qualityChecks.map((q) => (
              <li key={q.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                <Badge variant={q.result === "pass" ? "success" : q.result === "fail" ? "danger" : "warning"} size="sm">
                  {t(q.result)}
                </Badge>
                <span className="tabular-nums text-slate-500">
                  {q.passedQuantity}/{q.checkedQuantity} {t("passed")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {issuingMaterials ? (
        <IssueMaterialsModal
          open={issuingMaterials}
          onOpenChange={setIssuingMaterials}
          workOrderId={workOrderId}
          onSuccess={() => void mutate()}
        />
      ) : null}
      {loggingLabor ? (
        <LogLaborModal open={loggingLabor} onOpenChange={setLoggingLabor} workOrderId={workOrderId} onSuccess={() => void mutate()} />
      ) : null}
      {recordingOutput ? (
        <RecordOutputModal open={recordingOutput} onOpenChange={setRecordingOutput} workOrderId={workOrderId} onSuccess={() => void mutate()} />
      ) : null}
      {recordingQc ? (
        <RecordQualityCheckModal open={recordingQc} onOpenChange={setRecordingQc} workOrderId={workOrderId} onSuccess={() => void mutate()} />
      ) : null}
    </>
  );
}

function IssueMaterialsModal({
  open,
  onOpenChange,
  workOrderId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { data: locations } = useSWR("factory-locations", listFactoryLocations);
  const [locationId, setLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!locationId) return;
    setSubmitting(true);
    try {
      const result = await issueBomMaterials(workOrderId, locationId);
      toast.success(`${t("Materials issued")} (${(result as { issuedMaterialCount: number }).issuedMaterialCount})`);
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Issue Materials")}</DialogTitle>
            <DialogDescription>{t("Issues exactly the BOM-computed requirement for this order's quantity from the selected location.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-location">{t("From location")}</Label>
            <Select id="issue-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={submitting}>
              <option value="">{t("Select a location")}</option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {t(l.name)}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !locationId}>
              {submitting ? t("Issuing...") : t("Issue Materials")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogLaborModal({
  open,
  onOpenChange,
  workOrderId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [workerName, setWorkerName] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [quantityProduced, setQuantityProduced] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workerName.trim() || !hoursWorked.trim()) return;
    setSubmitting(true);
    try {
      await recordLabor(workOrderId, {
        workerName: workerName.trim(),
        hoursWorked: Number(hoursWorked),
        hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : undefined,
        quantityProduced: Number(quantityProduced) || 0,
      });
      toast.success(t("Labor logged"));
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Log Labor")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="labor-worker">{t("Worker name")}</Label>
            <Input id="labor-worker" value={workerName} onChange={(e) => setWorkerName(e.target.value)} disabled={submitting} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="labor-hours">{t("Hours")}</Label>
              <Input id="labor-hours" type="number" min="0" step="0.1" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="labor-rate">{t("Rate/hr")}</Label>
              <Input id="labor-rate" type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder={t("Optional")} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="labor-qty">{t("Units produced")}</Label>
              <Input id="labor-qty" type="number" min="0" step="1" value={quantityProduced} onChange={(e) => setQuantityProduced(e.target.value)} disabled={submitting} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !workerName.trim() || !hoursWorked.trim()}>
              {submitting ? t("Saving...") : t("Log Labor")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordOutputModal({
  open,
  onOpenChange,
  workOrderId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { data: locations } = useSWR("factory-locations", listFactoryLocations);
  const [quantityGood, setQuantityGood] = useState("0");
  const [quantityScrap, setQuantityScrap] = useState("0");
  const [scrapReason, setScrapReason] = useState("");
  const [locationId, setLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const good = Number(quantityGood) || 0;
    const scrap = Number(quantityScrap) || 0;
    if (good <= 0 && scrap <= 0) return;

    setSubmitting(true);
    try {
      await recordOutput(workOrderId, {
        quantityGood: good,
        quantityScrap: scrap,
        scrapReason: scrapReason.trim() || undefined,
        locationId: locationId || undefined,
      });
      toast.success(t("Output recorded"));
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Record Output")}</DialogTitle>
            <DialogDescription>{t("Good units are added to Finished Goods Inventory immediately.")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="output-good">{t("Good units")}</Label>
              <Input id="output-good" type="number" min="0" step="1" value={quantityGood} onChange={(e) => setQuantityGood(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="output-scrap">{t("Scrap units")}</Label>
              <Input id="output-scrap" type="number" min="0" step="1" value={quantityScrap} onChange={(e) => setQuantityScrap(e.target.value)} disabled={submitting} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="output-scrap-reason">{t("Scrap reason")}</Label>
            <Input id="output-scrap-reason" value={scrapReason} onChange={(e) => setScrapReason(e.target.value)} placeholder={t("Optional")} disabled={submitting} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="output-location">{t("Finished goods location")}</Label>
            <Select id="output-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={submitting}>
              <option value="">{t("Default finished-goods location")}</option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {t(l.name)}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Record Output")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordQualityCheckModal({
  open,
  onOpenChange,
  workOrderId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [checkedQuantity, setCheckedQuantity] = useState("");
  const [failedQuantity, setFailedQuantity] = useState("0");
  const [result, setResult] = useState<"pass" | "fail" | "rework">("pass");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const checked = Number(checkedQuantity);
    const failed = Number(failedQuantity) || 0;
    if (!checked || failed > checked) return;

    setSubmitting(true);
    try {
      await recordQualityCheck(workOrderId, {
        checkedQuantity: checked,
        passedQuantity: checked - failed,
        failedQuantity: failed,
        result,
        inspectorNotes: notes.trim() || undefined,
      });
      toast.success(t("Quality check recorded"));
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Record Quality Check")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-checked">{t("Checked quantity")}</Label>
              <Input id="qc-checked" type="number" min="1" step="1" value={checkedQuantity} onChange={(e) => setCheckedQuantity(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-failed">{t("Failed quantity")}</Label>
              <Input id="qc-failed" type="number" min="0" step="1" value={failedQuantity} onChange={(e) => setFailedQuantity(e.target.value)} disabled={submitting} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-result">{t("Result")}</Label>
            <Select id="qc-result" value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail" | "rework")} disabled={submitting}>
              <option value="pass">{t("pass")}</option>
              <option value="fail">{t("fail")}</option>
              <option value="rework">{t("rework")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-notes">{t("Inspector notes")}</Label>
            <Input id="qc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Optional")} disabled={submitting} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !checkedQuantity.trim()}>
              {submitting ? t("Saving...") : t("Record Quality Check")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
