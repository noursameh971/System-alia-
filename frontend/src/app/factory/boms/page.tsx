"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import {
  createBom,
  createFinishedGood,
  getBom,
  getFinishedGood,
  listBoms,
  listFinishedGoods,
  listMaterials,
  listStageTemplates,
  shipFinishedGood,
  updateBomStatus,
} from "@/lib/factory";
import { listBrands } from "@/lib/brands";
import type { BomDetail } from "@/lib/factoryTypes";
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

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning"> = { draft: "neutral", active: "success", archived: "warning" };

export default function BomsPage() {
  const { t } = useLocale();
  const { data: finishedGoods, mutate: mutateFinishedGoods } = useSWR("factory-finished-goods", listFinishedGoods);
  const { data: boms, isLoading, error, mutate: mutateBoms } = useSWR("factory-boms", () => listBoms());
  const [addingFinishedGood, setAddingFinishedGood] = useState(false);
  const [creatingBom, setCreatingBom] = useState(false);
  const [viewingBomId, setViewingBomId] = useState<string | null>(null);
  const [viewingFinishedGoodId, setViewingFinishedGoodId] = useState<string | null>(null);

  async function handleStatusChange(bomId: string, status: "active" | "archived") {
    try {
      await updateBomStatus(bomId, status);
      toast.success(t("BOM updated"));
      void mutateBoms();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    }
  }

  return (
    <>
      <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Finished Goods")}</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddingFinishedGood(true)}>
            <Plus className="size-3.5" />
            {t("Add Finished Good")}
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {(finishedGoods ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("No finished goods yet.")}</p>
          ) : (
            finishedGoods!.map((fg) => (
              <button
                key={fg.id}
                type="button"
                onClick={() => setViewingFinishedGoodId(fg.id)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-start transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fg.name}</p>
                  {fg.brandName ? (
                    <Badge variant="neutral" size="sm">
                      {fg.brandName}
                    </Badge>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-slate-400">
                  {fg.sku} · {t(fg.unit)}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Bill of Materials")}</h2>
          <Button type="button" size="sm" onClick={() => setCreatingBom(true)} disabled={!finishedGoods || finishedGoods.length === 0}>
            <Plus className="size-3.5" />
            {t("Create BOM")}
          </Button>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading BOMs..." />
            </div>
          ) : error ? (
            <EmptyState title="Couldn't load BOMs" description={error instanceof ApiError ? error.message : undefined} />
          ) : !boms || boms.length === 0 ? (
            <EmptyState title={t("No BOMs yet")} description={t("Create a Bill of Materials to define what a finished good is made from.")} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("Finished Good")}</TableHead>
                    <TableHead>{t("Brand")}</TableHead>
                    <TableHead>{t("Version")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Batch output")}</TableHead>
                    <TableHead className="text-end">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boms.map((bom) => (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">{bom.finishedGoodName}</TableCell>
                      <TableCell>{bom.brandName ?? "—"}</TableCell>
                      <TableCell>v{bom.version}{bom.label ? ` — ${bom.label}` : ""}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[bom.status] ?? "neutral"} size="sm">
                          {t(bom.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{bom.outputQuantity}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setViewingBomId(bom.id)}>
                            {t("View")}
                          </Button>
                          {bom.status === "draft" ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleStatusChange(bom.id, "active")}>
                              {t("Activate")}
                            </Button>
                          ) : null}
                          {bom.status === "active" ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleStatusChange(bom.id, "archived")}>
                              {t("Archive")}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      {addingFinishedGood ? (
        <AddFinishedGoodModal open={addingFinishedGood} onOpenChange={setAddingFinishedGood} onSuccess={() => void mutateFinishedGoods()} />
      ) : null}
      {creatingBom ? (
        <CreateBomModal
          open={creatingBom}
          onOpenChange={setCreatingBom}
          finishedGoods={finishedGoods ?? []}
          onSuccess={() => void mutateBoms()}
        />
      ) : null}
      {viewingBomId ? <ViewBomModal bomId={viewingBomId} onOpenChange={(open) => !open && setViewingBomId(null)} /> : null}
      {viewingFinishedGoodId ? (
        <FinishedGoodDetailModal finishedGoodId={viewingFinishedGoodId} onOpenChange={(open) => !open && setViewingFinishedGoodId(null)} />
      ) : null}
    </>
  );
}

function AddFinishedGoodModal({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const { t } = useLocale();
  const { data: brands } = useSWR("brands", listBrands);
  const [name, setName] = useState("");
  // Blank rather than a hardcoded "piece" default — that English word would
  // show as-is in an Arabic session; handleSubmit already falls back to
  // "piece" itself when this is left empty.
  const [unit, setUnit] = useState("");
  const [brandId, setBrandId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !brandId) return;
    setSubmitting(true);
    try {
      await createFinishedGood({ name: name.trim(), unit: unit.trim() || "piece", brandId });
      toast.success(t("Finished good added"));
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
            <DialogTitle>{t("Add Finished Good")}</DialogTitle>
            <DialogDescription>{t("What the factory produces — the thing a Bill of Materials and Work Order are built around.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fg-name">{t("Name")}</Label>
            <Input id="fg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Classic Abaya")} disabled={submitting} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fg-brand">{t("Brand")}</Label>
            <Select id="fg-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={submitting}>
              <option value="">{t("Select a brand")}</option>
              {(brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fg-unit">{t("Unit")}</Label>
            <Input id="fg-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("piece")} disabled={submitting} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !brandId}>
              {submitting ? t("Saving...") : t("Add Finished Good")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DraftLine {
  materialId: string;
  quantityPerBatch: string;
  wasteAllowancePct: string;
}
interface DraftStage {
  stageTemplateId: string;
}

function CreateBomModal({
  open,
  onOpenChange,
  finishedGoods,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finishedGoods: { id: string; name: string }[];
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { data: materials } = useSWR("factory-materials", listMaterials);
  const { data: stageTemplates } = useSWR("factory-stage-templates", listStageTemplates);

  const [finishedGoodId, setFinishedGoodId] = useState(finishedGoods[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([{ materialId: "", quantityPerBatch: "", wasteAllowancePct: "0" }]);
  const [stages, setStages] = useState<DraftStage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validLines = lines.filter((l) => l.materialId && l.quantityPerBatch.trim());
    if (!finishedGoodId || validLines.length === 0) return;

    setSubmitting(true);
    try {
      await createBom({
        finishedGoodId,
        label: label.trim() || undefined,
        outputQuantity: Number(outputQuantity) || 1,
        lines: validLines.map((l, i) => ({
          materialId: l.materialId,
          quantityPerBatch: Number(l.quantityPerBatch),
          wasteAllowancePct: Number(l.wasteAllowancePct) || 0,
          sequenceOrder: i,
        })),
        stages: stages
          .filter((s) => s.stageTemplateId)
          .map((s, i) => ({ stageTemplateId: s.stageTemplateId, sequenceOrder: (i + 1) * 10 })),
      });
      toast.success(t("BOM created"));
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
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Create Bill of Materials")}</DialogTitle>
            <DialogDescription>{t("What materials (and how much of each) it takes to produce one batch of a finished good.")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bom-finished-good">{t("Finished Good")}</Label>
              <Select id="bom-finished-good" value={finishedGoodId} onChange={(e) => setFinishedGoodId(e.target.value)} disabled={submitting}>
                {finishedGoods.map((fg) => (
                  <option key={fg.id} value={fg.id}>
                    {fg.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bom-output-qty">{t("Batch output qty")}</Label>
              <Input id="bom-output-qty" type="number" min="0.001" step="0.001" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} disabled={submitting} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bom-label">{t("Label")}</Label>
            <Input id="bom-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("Optional, e.g. \"Winter fabric\"")} disabled={submitting} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("Materials")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => [...prev, { materialId: "", quantityPerBatch: "", wasteAllowancePct: "0" }])}
              >
                <Plus className="size-3.5" />
                {t("Add line")}
              </Button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  wrapperClassName="min-w-0 flex-1"
                  value={line.materialId}
                  onChange={(e) => updateLine(i, { materialId: e.target.value })}
                  disabled={submitting}
                >
                  <option value="">{t("Select material")}</option>
                  {(materials ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({t(m.unit)})
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder={t("Qty/batch")}
                  className="w-28"
                  value={line.quantityPerBatch}
                  onChange={(e) => updateLine(i, { quantityPerBatch: e.target.value })}
                  disabled={submitting}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder={t("Waste %")}
                  className="w-24"
                  value={line.wasteAllowancePct}
                  onChange={(e) => updateLine(i, { wasteAllowancePct: e.target.value })}
                  disabled={submitting}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} disabled={submitting}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("Routing stages")} ({t("optional")})</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStages((prev) => [...prev, { stageTemplateId: "" }])}>
                <Plus className="size-3.5" />
                {t("Add stage")}
              </Button>
            </div>
            {stages.map((stage, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}.</span>
                <Select
                  wrapperClassName="min-w-0 flex-1"
                  value={stage.stageTemplateId}
                  onChange={(e) => setStages((prev) => prev.map((s, idx) => (idx === i ? { stageTemplateId: e.target.value } : s)))}
                  disabled={submitting}
                >
                  <option value="">{t("Select stage")}</option>
                  {(stageTemplates ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.name)}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" size="icon" onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))} disabled={submitting}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !finishedGoodId || lines.every((l) => !l.materialId)}>
              {submitting ? t("Saving...") : t("Create BOM")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewBomModal({ bomId, onOpenChange }: { bomId: string; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale();
  const { data: bom, isLoading } = useSWR<BomDetail>(["factory-bom", bomId], () => getBom(bomId));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{bom ? `${bom.finishedGoodName} — v${bom.version}` : t("Loading...")}</DialogTitle>
        </DialogHeader>
        {isLoading || !bom ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading..." />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Materials")}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {bom.lines.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>{l.materialName}</span>
                    <span className="tabular-nums text-slate-500">
                      {l.quantityPerBatch} {t(l.materialUnit)}
                      {l.wasteAllowancePct > 0 ? ` (+${l.wasteAllowancePct}% ${t("waste")})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {bom.stages.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Routing")}</p>
                <ol className="flex flex-col gap-1 text-sm">
                  {bom.stages.map((s, i) => (
                    <li key={s.id}>
                      {i + 1}. {t(s.stageName)}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FinishedGoodDetailModal({ finishedGoodId, onOpenChange }: { finishedGoodId: string; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale();
  const { data: fg, isLoading, mutate } = useSWR(["factory-finished-good", finishedGoodId], () => getFinishedGood(finishedGoodId));
  const [shipping, setShipping] = useState(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fg ? fg.name : t("Loading...")}</DialogTitle>
          {fg ? (
            <DialogDescription>
              {fg.sku} · {t(fg.unit)}
              {fg.brandName ? ` · ${fg.brandName}` : ""}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {isLoading || !fg ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading..." />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Stock by location")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setShipping(true)} disabled={fg.stockByLocation.length === 0}>
                {t("Ship to Brand")}
              </Button>
            </div>
            {fg.stockByLocation.length === 0 ? (
              <p className="text-sm text-slate-400">{t("No stock yet.")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {fg.stockByLocation.map((s) => (
                  <li key={s.locationId} className="flex justify-between">
                    <span>{t(s.locationName)}</span>
                    <span className="tabular-nums text-slate-500">
                      {s.quantity} {t(fg.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Recent movements")}</p>
              {fg.recentMovements.length === 0 ? (
                <p className="text-sm text-slate-400">{t("No movements yet.")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {fg.recentMovements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                      <span>{t(m.movementType)}</span>
                      <span className="tabular-nums text-slate-500">
                        {m.quantity} {t(fg.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      {shipping ? (
        <ShipToBrandModal
          finishedGoodId={finishedGoodId}
          stockByLocation={fg?.stockByLocation ?? []}
          unit={fg?.unit ?? "piece"}
          open={shipping}
          onOpenChange={setShipping}
          onSuccess={() => void mutate()}
        />
      ) : null}
    </Dialog>
  );
}

function ShipToBrandModal({
  finishedGoodId,
  stockByLocation,
  unit,
  open,
  onOpenChange,
  onSuccess,
}: {
  finishedGoodId: string;
  stockByLocation: { locationId: string; locationName: string; quantity: number }[];
  unit: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { data: brands } = useSWR("brands", listBrands);
  const [brandId, setBrandId] = useState("");
  const [fromLocationId, setFromLocationId] = useState(stockByLocation[0]?.locationId ?? "");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedLocationStock = stockByLocation.find((s) => s.locationId === fromLocationId)?.quantity ?? 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!brandId || !fromLocationId || !qty || qty <= 0) return;

    setSubmitting(true);
    try {
      await shipFinishedGood(finishedGoodId, { brandId, fromLocationId, quantity: qty, notes: notes.trim() || undefined });
      toast.success(t("Shipped to brand"));
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
            <DialogTitle>{t("Ship to Brand")}</DialogTitle>
            <DialogDescription>{t("Records finished-goods stock leaving the factory for a brand — a reference only, it never touches that brand's own data.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ship-brand">{t("Brand")}</Label>
            <Select id="ship-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={submitting}>
              <option value="">{t("Select a brand")}</option>
              {(brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship-location">{t("From location")}</Label>
              <Select id="ship-location" value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} disabled={submitting}>
                {stockByLocation.map((s) => (
                  <option key={s.locationId} value={s.locationId}>
                    {t(s.locationName)} ({s.quantity} {t(unit)})
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship-quantity">{t("Quantity")}</Label>
              <Input
                id="ship-quantity"
                type="number"
                min="0.001"
                max={selectedLocationStock}
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ship-notes">{t("Notes")}</Label>
            <Input id="ship-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Optional")} disabled={submitting} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !brandId || !fromLocationId || !quantity.trim()}>
              {submitting ? t("Shipping...") : t("Ship to Brand")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
