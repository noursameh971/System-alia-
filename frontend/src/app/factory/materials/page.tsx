"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, Plus } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import {
  createFactoryLocation,
  createMaterial,
  createMaterialCategory,
  listFactoryLocations,
  listMaterialCategories,
  listMaterials,
  recordMaterialMovement,
} from "@/lib/factory";
import type { MaterialMovementInput, MaterialSummary } from "@/lib/factoryTypes";
import { useLocale } from "@/context/LocaleContext";
import { formatPrice } from "@/lib/formatPrice";
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

const SUGGESTED_UNITS = ["kg", "gram", "meter", "cm", "liter", "ml", "piece", "roll", "yard"];

export default function MaterialsPage() {
  const { t } = useLocale();
  const { data: materials, isLoading, error, mutate } = useSWR("factory-materials", listMaterials);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [movementTarget, setMovementTarget] = useState<MaterialSummary | null>(null);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Raw Materials")}</h2>
        <Button type="button" size="sm" onClick={() => setAddingMaterial(true)}>
          <Plus className="size-3.5" />
          {t("Add Material")}
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner label="Loading materials..." />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load materials" description={error instanceof ApiError ? error.message : undefined} />
        ) : !materials || materials.length === 0 ? (
          <EmptyState
            title={t("No materials yet")}
            description={t("Add your first raw material to start tracking stock and cost.")}
            action={
              <Button type="button" size="sm" onClick={() => setAddingMaterial(true)}>
                <Plus className="size-3.5" />
                {t("Add Material")}
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("Material")}</TableHead>
                  <TableHead>{t("Category")}</TableHead>
                  <TableHead>{t("Unit")}</TableHead>
                  <TableHead>{t("Cost / unit")}</TableHead>
                  <TableHead>{t("Stock")}</TableHead>
                  <TableHead className="text-end">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {m.name}
                        {m.belowReorderLevel ? (
                          <span title={t("Below reorder level")}>
                            <AlertTriangle className="size-3.5 text-amber-500" />
                          </span>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-slate-400">{m.sku}</div>
                    </TableCell>
                    <TableCell>{m.categoryName}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                    <TableCell className="tabular-nums">{m.currentCostPerUnit != null ? formatPrice(m.currentCostPerUnit) : "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {m.totalStock} {m.unit}
                      {m.belowReorderLevel ? (
                        <Badge variant="warning" size="sm" className="ms-2">
                          {t("Low stock")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => setMovementTarget(m)}>
                        {t("Record Movement")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {addingMaterial ? <AddMaterialModal open={addingMaterial} onOpenChange={setAddingMaterial} onSuccess={() => void mutate()} /> : null}
      {movementTarget ? (
        <RecordMovementModal
          open={Boolean(movementTarget)}
          onOpenChange={(open) => !open && setMovementTarget(null)}
          material={movementTarget}
          onSuccess={() => void mutate()}
        />
      ) : null}
    </section>
  );
}

function AddMaterialModal({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const { t } = useLocale();
  const { data: categories, mutate: mutateCategories } = useSWR("factory-material-categories", listMaterialCategories);
  const { data: locations } = useSWR("factory-locations", listFactoryLocations);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("meter");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [initialCost, setInitialCost] = useState("");
  const [initialLocationId, setInitialLocationId] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddCategory() {
    if (!newCategoryName.trim() || !newCategoryCode.trim()) return;
    try {
      const created = await createMaterialCategory(newCategoryName.trim(), newCategoryCode.trim());
      await mutateCategories();
      setCategoryId(created.id);
      setNewCategoryName("");
      setNewCategoryCode("");
      setAddingCategory(false);
      toast.success(t("Category added"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !categoryId || !unit.trim()) return;

    setSubmitting(true);
    try {
      await createMaterial({
        categoryId,
        name: name.trim(),
        unit: unit.trim(),
        reorderLevel: Number(reorderLevel) || 0,
        initialCostPerUnit: initialCost.trim() ? Number(initialCost) : undefined,
        initialStock: initialLocationId && initialQuantity.trim() ? { locationId: initialLocationId, quantity: Number(initialQuantity) } : undefined,
      });
      toast.success(t("Material added"));
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
            <DialogTitle>{t("Add Material")}</DialogTitle>
            <DialogDescription>{t("A raw material tracked by unit, cost, and stock across locations.")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-name">{t("Name")}</Label>
            <Input id="material-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Cotton Fabric — White")} disabled={submitting} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-category">{t("Category")}</Label>
              <Select id="material-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={submitting}>
                <option value="">{t("Select a category")}</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {!addingCategory ? (
                <button type="button" className="w-fit text-xs font-medium text-indigo-600 hover:underline" onClick={() => setAddingCategory(true)}>
                  + {t("New category")}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={t("Name")} className="h-8" />
                  <Input value={newCategoryCode} onChange={(e) => setNewCategoryCode(e.target.value)} placeholder={t("Code")} className="h-8 w-20" />
                  <Button type="button" size="sm" onClick={() => void handleAddCategory()}>
                    {t("Add")}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-unit">{t("Unit")}</Label>
              <Input id="material-unit" list="material-unit-options" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={submitting} />
              <datalist id="material-unit-options">
                {SUGGESTED_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-reorder">{t("Reorder level")}</Label>
              <Input id="material-reorder" type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-cost">{t("Cost per unit")} (EGP)</Label>
              <Input
                id="material-cost"
                type="number"
                min="0"
                step="0.01"
                value={initialCost}
                onChange={(e) => setInitialCost(e.target.value)}
                placeholder={t("Optional")}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-location">{t("Initial stock location")}</Label>
              <Select id="material-location" value={initialLocationId} onChange={(e) => setInitialLocationId(e.target.value)} disabled={submitting}>
                <option value="">{t("None")}</option>
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-quantity">{t("Initial quantity")}</Label>
              <Input
                id="material-quantity"
                type="number"
                min="0"
                step="0.001"
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(e.target.value)}
                disabled={submitting || !initialLocationId}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !categoryId}>
              {submitting ? t("Saving...") : t("Add Material")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordMovementModal({
  open,
  onOpenChange,
  material,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialSummary;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { data: locations } = useSWR("factory-locations", listFactoryLocations);
  const [movementType, setMovementType] = useState<MaterialMovementInput["movementType"]>("receipt");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!locationId || !quantity.trim()) return;

    setSubmitting(true);
    try {
      const qty = Number(quantity);
      let input: MaterialMovementInput;
      if (movementType === "receipt") input = { movementType: "receipt", toLocationId: locationId, quantity: qty, notes };
      else if (movementType === "return") input = { movementType: "return", toLocationId: locationId, quantity: qty, notes };
      else if (movementType === "issue") input = { movementType: "issue", fromLocationId: locationId, quantity: qty, notes };
      else if (movementType === "waste") input = { movementType: "waste", fromLocationId: locationId, quantity: qty, notes };
      else input = { movementType: "adjustment", locationId, newQuantity: qty, notes };

      await recordMaterialMovement(material.id, input);
      toast.success(t("Movement recorded"));
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
            <DialogTitle>
              {t("Record Movement")} — {material.name}
            </DialogTitle>
            <DialogDescription>
              {t("Current stock")}: {material.totalStock} {material.unit}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-type">{t("Movement type")}</Label>
            <Select
              id="movement-type"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as MaterialMovementInput["movementType"])}
              disabled={submitting}
            >
              <option value="receipt">{t("Receipt (stock in)")}</option>
              <option value="issue">{t("Issue (manual, not against a work order)")}</option>
              <option value="return">{t("Return (unused stock back)")}</option>
              <option value="waste">{t("Waste / damage")}</option>
              <option value="adjustment">{t("Stock count adjustment")}</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="movement-location">{movementType === "adjustment" ? t("Location") : t("Location")}</Label>
              <Select id="movement-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={submitting}>
                <option value="">{t("Select a location")}</option>
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="movement-quantity">{movementType === "adjustment" ? t("New quantity") : t("Quantity")}</Label>
              <Input
                id="movement-quantity"
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-notes">{t("Notes")}</Label>
            <Input id="movement-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Optional")} disabled={submitting} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !locationId || !quantity.trim()}>
              {submitting ? t("Saving...") : t("Record Movement")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
