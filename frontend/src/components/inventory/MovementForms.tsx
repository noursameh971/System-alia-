"use client";

import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useLocale } from "@/context/LocaleContext";
import { listRecentMovements } from "@/lib/inventory";
import type { RecentMovementLogItem } from "@/lib/types";
import { ScanQueuePanel, type MovementKind } from "./ScanQueuePanel";
import { RecentMovementsLog } from "./RecentMovementsLog";

const RECENT_PAGE_SIZE = 25;

// "transfer" is temporarily hidden from the tab bar (not removed from
// MovementKind/the backend) — re-add the entry below to bring it back.
const MOVEMENT_TYPES: { key: MovementKind; label: string }[] = [
  { key: "inbound", label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "gift", label: "Gift" },
  { key: "return", label: "Return" },
];

export function MovementForms() {
  const { brand } = useWorkspace();
  const { t } = useLocale();
  const [active, setActive] = useState<MovementKind>("inbound");

  // The full history, a page at a time — the log asks for the next page as it's scrolled to the bottom.
  const {
    data: recentPages,
    mutate: refreshRecent,
    size,
    setSize,
    isValidating,
  } = useSWRInfinite(
    (pageIndex, previous: RecentMovementLogItem[] | null) =>
      previous && previous.length < RECENT_PAGE_SIZE ? null : ["recent-movements", brand.id, pageIndex],
    ([, brandId, pageIndex]) => listRecentMovements(brandId as string, RECENT_PAGE_SIZE, (pageIndex as number) * RECENT_PAGE_SIZE),
  );
  const recentMovements = recentPages?.flat();
  const hasMore = !recentPages || (recentPages[recentPages.length - 1]?.length ?? 0) === RECENT_PAGE_SIZE;
  const isLoadingMore = isValidating && size > (recentPages?.length ?? 0);

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
        <RecentMovementsLog
          movements={recentMovements ?? []}
          onReverted={() => void refreshRecent()}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={() => void setSize(size + 1)}
        />
      </div>
    </div>
  );
}
