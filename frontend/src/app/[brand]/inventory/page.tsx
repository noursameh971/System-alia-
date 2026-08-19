"use client";

import { useState } from "react";
import { useLocale } from "@/context/LocaleContext";
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
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("Inventory")}</h1>
          {tab === "movement" ? (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("Scan continuously to build a batch, then execute it in one go.")}
            </p>
          ) : null}
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              onClick={() => setTab(tabItem.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === tabItem.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t(tabItem.label)}
            </button>
          ))}
        </div>
      </div>

      {tab === "movement" ? <MovementForms /> : <StockLevelsTable />}
    </div>
  );
}
