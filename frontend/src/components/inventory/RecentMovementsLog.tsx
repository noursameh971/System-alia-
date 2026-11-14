"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import type { RecentMovementLogItem } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ApiError } from "@/lib/apiClient";
import { revertMovements } from "@/lib/inventory";
import { MOVEMENT_LABEL, MOVEMENT_BADGE_VARIANT } from "@/lib/movementDisplay";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Lines executed together from the scan queue share one transaction, so they
 * carry the identical created_at (Postgres now() is per-transaction) — that,
 * plus type and user, is what groups them back into a batch here.
 */
function batchKey(m: RecentMovementLogItem): string {
  return `${m.createdAt}|${m.movementType}|${m.performedByName}`;
}

interface RevertRequest {
  /** What "Revert" on its own applies to: one row, or the current selection. */
  ids: string[];
  /** The rest of that row's batch, offered as "Revert whole batch" (single-row requests only). */
  batchIds: string[];
}

/** Latest movements for this brand across every type — the Inventory page's fast-scan activity feed. Admins also get Revert / Undo. */
export function RecentMovementsLog({
  movements,
  onReverted,
}: {
  movements: RecentMovementLogItem[];
  onReverted?: () => void;
}) {
  const { t } = useLocale();
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const canRevert = role === "admin";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [request, setRequest] = useState<RevertRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const batches = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of movements) {
      if (!m.revertible) continue;
      const key = batchKey(m);
      map.set(key, [...(map.get(key) ?? []), m.id]);
    }
    return map;
  }, [movements]);

  // Drop selections that stopped being revertible (or scrolled out of the log) after a refresh.
  const revertibleIds = useMemo(() => new Set(movements.filter((m) => m.revertible).map((m) => m.id)), [movements]);
  const selectedIds = [...selected].filter((id) => revertibleIds.has(id));
  const allSelected = revertibleIds.size > 0 && selectedIds.length === revertibleIds.size;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runRevert(ids: string[]) {
    setSubmitting(true);
    try {
      const result = await revertMovements(brand.id, ids);
      toast.success(
        result.revertedCount === 1
          ? t("Movement reverted — stock adjusted back")
          : `${result.revertedCount} ${t("movements reverted — stock adjusted back")}`,
      );
      setSelected(new Set());
      setRequest(null);
      onReverted?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to revert movement"));
    } finally {
      setSubmitting(false);
    }
  }

  if (movements.length === 0) {
    return (
      <EmptyState
        title={t("No recent activity")}
        description={t("Movements recorded for this workspace will show up here.")}
      />
    );
  }

  return (
    <>
      {canRevert && selectedIds.length > 0 ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-600 dark:text-slate-300">
            {selectedIds.length} {t("selected")}
          </span>
          <Button size="sm" variant="outline" onClick={() => setRequest({ ids: selectedIds, batchIds: [] })}>
            <Undo2 className="size-3.5" />
            {t("Revert selected")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {canRevert ? (
                <TableHead className="w-8 pe-0">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(revertibleIds) : new Set())}
                    disabled={revertibleIds.size === 0}
                    aria-label={t("Select all revertible movements")}
                    className="size-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-700"
                  />
                </TableHead>
              ) : null}
              <TableHead>{t("Type")}</TableHead>
              <TableHead>{t("Product")}</TableHead>
              <TableHead>{t("SKU")}</TableHead>
              <TableHead>{t("Qty")}</TableHead>
              <TableHead>{t("User")}</TableHead>
              <TableHead>{t("Time")}</TableHead>
              {canRevert ? <TableHead className="text-end">{t("Actions")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((m) => (
              <TableRow key={m.id} className={m.revertedAt ? "opacity-60" : undefined}>
                {canRevert ? (
                  <TableCell className="w-8 pe-0">
                    {m.revertible ? (
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={(e) => toggle(m.id, e.target.checked)}
                        aria-label={`${t("Select")} ${m.sku}`}
                        className="size-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-700"
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={MOVEMENT_BADGE_VARIANT[m.movementType] ?? "neutral"}>
                    {t(MOVEMENT_LABEL[m.movementType] ?? m.movementType)}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-700 dark:text-slate-300">
                  {m.productName}
                  {m.reasonLabel ? <div className="text-xs text-slate-500 dark:text-slate-400">{m.reasonLabel}</div> : null}
                  {m.reversalOfId ? <div className="text-xs text-slate-500 dark:text-slate-400">{t("Undo of an earlier movement")}</div> : null}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">{m.sku}</TableCell>
                <TableCell className={`tabular-nums text-slate-900 dark:text-slate-100 ${m.revertedAt ? "line-through" : ""}`}>{m.quantity}</TableCell>
                <TableCell className="text-slate-600 dark:text-slate-400">{m.performedByName}</TableCell>
                <TableCell className="text-xs text-slate-400 dark:text-slate-500" title={new Date(m.createdAt).toLocaleString()}>
                  {formatRelativeTime(m.createdAt)}
                </TableCell>
                {canRevert ? (
                  <TableCell className="text-end">
                    {m.revertedAt ? (
                      <Badge variant="neutral" size="sm">
                        {t("Reverted")}
                        {m.revertedByName ? ` · ${m.revertedByName}` : ""}
                      </Badge>
                    ) : m.revertible ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setRequest({ ids: [m.id], batchIds: batches.get(batchKey(m)) ?? [m.id] })}
                      >
                        <Undo2 className="size-3.5" />
                        {t("Revert")}
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={request !== null} onOpenChange={(open) => !open && !submitting && setRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {request && request.ids.length > 1
                ? `${t("Revert")} ${request.ids.length} ${t("movements?")}`
                : t("Revert this movement?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Reverting applies the exact opposite of the original movement to the same bins: stock that came in is taken back out, and stock that went out is put back. The original stays in the log, marked Reverted, and this can't be reverted again.",
              )}
            </DialogDescription>
          </DialogHeader>
          {request && request.batchIds.length > 1 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("This item was part of a batch of")} {request.batchIds.length} {t("items. You can revert just this item or the whole batch.")}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequest(null)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            {request && request.batchIds.length > 1 ? (
              <Button variant="outline" onClick={() => void runRevert(request.batchIds)} disabled={submitting}>
                {t("Revert whole batch")} ({request.batchIds.length})
              </Button>
            ) : null}
            <Button
              onClick={() => request && void runRevert(request.ids)}
              disabled={submitting}
              className="bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
            >
              {submitting
                ? t("Reverting...")
                : request && request.batchIds.length > 1
                  ? t("Revert this item")
                  : t("Revert")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
