"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { getDashboardSummary } from "@/lib/dashboard";
import { ApiError } from "@/lib/apiClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/dashboard/StatTile";
import { BrandComparison } from "@/components/dashboard/BrandComparison";
import { RecentMovementsList } from "@/components/dashboard/RecentMovementsList";

export default function DashboardPage() {
  const router = useRouter();
  const { role } = useCurrentUser();
  const isAdmin = role === "admin";

  const { data, error, isLoading } = useSWR(isAdmin ? "dashboard-summary" : null, getDashboardSummary);

  useEffect(() => {
    // Client-side convenience only — GET /api/dashboard/summary is the
    // real enforcement (requireRole('admin')), which doesn't change if
    // this check is ever bypassed.
    if (!isAdmin) router.replace("/");
  }, [isAdmin, router]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Company Dashboard</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Both brands, combined</p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Workspaces
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading company data..." />
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load the dashboard"
            description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
          />
        ) : !data ? null : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Total Revenue" value={`${data.totals.revenue.toFixed(2)} EGP`} />
              <StatTile label="Total Orders" value={String(data.totals.orderCount)} />
              <StatTile label="Inventory Value" value={`${data.totals.inventoryValue.toFixed(2)} EGP`} />
              <StatTile label="Units in Stock" value={String(data.totals.inventoryUnitCount)} />
            </div>

            <BrandComparison brands={data.brands} />

            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2>
              <RecentMovementsList movements={data.recentMovements} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
