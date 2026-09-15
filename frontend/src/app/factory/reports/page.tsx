"use client";

import { useState } from "react";
import useSWR from "swr";
import { ApiError } from "@/lib/apiClient";
import { getCostingReport, getMrpReport, getScrapReport } from "@/lib/factory";
import { useLocale } from "@/context/LocaleContext";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SUB_TABS = [
  { key: "mrp", label: "Raw Material MRP" },
  { key: "scrap", label: "Scrap & Waste" },
  { key: "costing", label: "Factory Costing" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning"> = { in_progress: "warning", paused: "warning", completed: "success" };

export default function FactoryReportsPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<SubTab>("mrp");

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/90 p-7 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("Reports")}</h2>
      <nav className="mt-4 flex flex-wrap gap-1.5">
        {SUB_TABS.map((st) => (
          <button
            key={st.key}
            type="button"
            onClick={() => setTab(st.key)}
            className={
              tab === st.key
                ? "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }
          >
            {t(st.label)}
          </button>
        ))}
      </nav>
      <div className="mt-6">
        {tab === "mrp" ? <MrpTab /> : tab === "scrap" ? <ScrapTab /> : <CostingTab />}
      </div>
    </section>
  );
}

function MrpTab() {
  const { t } = useLocale();
  const { data, isLoading, error } = useSWR("factory-mrp-report", getMrpReport);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading..." />
      </div>
    );
  }
  if (error) return <EmptyState title="Couldn't load the MRP report" description={error instanceof ApiError ? error.message : undefined} />;
  if (!data || data.length === 0) {
    return <EmptyState title={t("No open material requirements")} description={t("Every open work order's material needs are covered by current stock.")} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("Material")}</TableHead>
            <TableHead>{t("Open work orders")}</TableHead>
            <TableHead>{t("Total required")}</TableHead>
            <TableHead>{t("Available")}</TableHead>
            <TableHead>{t("Reorder level")}</TableHead>
            <TableHead>{t("Shortfall")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.materialId}>
              <TableCell className="font-medium">
                {r.materialName}
                <span className="ms-1.5 font-mono text-xs text-slate-400">{r.sku}</span>
              </TableCell>
              <TableCell className="tabular-nums">{r.openWorkOrderCount}</TableCell>
              <TableCell className="tabular-nums">
                {r.totalRequired.toFixed(2)} {t(r.unit)}
              </TableCell>
              <TableCell className="tabular-nums">
                {r.availableQuantity.toFixed(2)} {t(r.unit)}
              </TableCell>
              <TableCell className="tabular-nums text-slate-500">
                {r.reorderLevel.toFixed(2)} {t(r.unit)}
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
  );
}

function ScrapTab() {
  const { t } = useLocale();
  const { data, isLoading, error } = useSWR("factory-scrap-report", getScrapReport);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading..." />
      </div>
    );
  }
  if (error) return <EmptyState title="Couldn't load the scrap report" description={error instanceof ApiError ? error.message : undefined} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Good output")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{data.totalGood}</p>
        </div>
        <div className="min-w-[160px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Total scrap")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{data.totalScrap}</p>
        </div>
        <div className="min-w-[160px] rounded-lg bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Scrap rate")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.scrapRatePct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Scrap by reason")}</p>
          {data.byReason.length === 0 ? (
            <p className="text-sm text-slate-400">{t("No scrap recorded yet.")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.byReason.map((r) => (
                <li key={r.reason} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <span>{t(r.reason)}</span>
                  <span className="tabular-nums text-rose-600 dark:text-rose-400">{r.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Scrap by product")}</p>
          {data.byProduct.length === 0 ? (
            <p className="text-sm text-slate-400">{t("No scrap recorded yet.")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.byProduct.map((p) => (
                <li key={p.finishedGoodId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <span>{p.finishedGoodName}</span>
                  <span className="tabular-nums text-slate-500">{p.scrapRatePct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Raw material waste")}</p>
        {data.materialWaste.length === 0 ? (
          <p className="text-sm text-slate-400">{t("No raw material waste recorded yet.")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("Material")}</TableHead>
                  <TableHead>{t("Quantity wasted")}</TableHead>
                  <TableHead>{t("Estimated cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.materialWaste.map((m) => (
                  <TableRow key={m.materialId}>
                    <TableCell className="font-medium">{m.materialName}</TableCell>
                    <TableCell className="tabular-nums">
                      {m.quantity.toFixed(2)} {t(m.unit)}
                    </TableCell>
                    <TableCell className="tabular-nums">{m.estimatedCost.toFixed(2)} {t("EGP")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function CostingTab() {
  const { t } = useLocale();
  const { data, isLoading, error } = useSWR("factory-costing-report", getCostingReport);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading..." />
      </div>
    );
  }
  if (error) return <EmptyState title="Couldn't load the costing report" description={error instanceof ApiError ? error.message : undefined} />;
  if (!data || data.length === 0) {
    return <EmptyState title={t("No costed work orders yet")} description={t("Costs appear here once materials are issued or labor is logged against an active work order.")} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("Work Order")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead>{t("Material cost")}</TableHead>
            <TableHead>{t("Labor cost")}</TableHead>
            <TableHead>{t("Total cost")}</TableHead>
            <TableHead>{t("Unit cost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.workOrderId}>
              <TableCell className="font-medium">
                {r.orderNumber}
                <span className="ms-1.5 text-xs text-slate-400">{r.finishedGoodName}</span>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"} size="sm">
                  {t(r.status)}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{r.materialCost.toFixed(2)} {t("EGP")}</TableCell>
              <TableCell className="tabular-nums">{r.laborCost.toFixed(2)} {t("EGP")}</TableCell>
              <TableCell className="tabular-nums font-semibold">{r.totalCost.toFixed(2)} {t("EGP")}</TableCell>
              <TableCell className="tabular-nums text-slate-500">{r.unitCost != null ? `${r.unitCost.toFixed(2)} ${t("EGP")}` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
