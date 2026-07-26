"use client";

import { useState } from "react";
import { StockLevelsTable } from "@/components/inventory/StockLevelsTable";
import { MovementForms } from "@/components/inventory/MovementForms";

const TABS = [
  { key: "movement", label: "Record Movement" },
  { key: "levels", label: "Stock Levels" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InventoryPage() {
  // Defaults to the movement form — for staff actively working the floor,
  // recording a movement is the far more frequent action than browsing the
  // dashboard, so it should be the zero-tap landing state.
  const [tab, setTab] = useState<TabKey>("movement");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inventory</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {tab === "movement"
              ? "Scan or type a SKU, pick a bin, enter a quantity."
              : "Current stock, filterable by brand (toggle above), category, zone, and bin."}
          </p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "movement" ? <MovementForms /> : <StockLevelsTable />}
    </div>
  );
}
