"use client";

import { useState } from "react";
import useSWR from "swr";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useLocale } from "@/context/LocaleContext";
import { listRecentMovements } from "@/lib/inventory";
import { ScanQueuePanel, type MovementKind } from "./ScanQueuePanel";
import { RecentMovementsLog } from "./RecentMovementsLog";

const MOVEMENT_TYPES: { key: MovementKind; label: string }[] = [
  { key: "inbound", label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "transfer", label: "Transfer" },
  { key: "return", label: "Return" },
];

export function MovementForms() {
  const { brand } = useWorkspace();
  const { t } = useLocale();
  const [active, setActive] = useState<MovementKind>("inbound");

  const { data: recentMovements, mutate: refreshRecent } = useSWR(["recent-movements", brand.id], () =>
    listRecentMovements(brand.id, 10),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-4 flex max-w-lg rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {MOVEMENT_TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              onClick={() => setActive(type.key)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                active === type.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t(type.label)}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          {/* key={active} forces a full remount on tab switch — each panel gets a clean queue instead of carrying stale state (or a stale movement-type payload) from another tab. */}
          <ScanQueuePanel key={active} movementType={active} onExecuted={() => void refreshRecent()} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Recent Movements Log")}</h2>
        <RecentMovementsLog movements={recentMovements ?? []} />
      </div>
    </div>
  );
}
