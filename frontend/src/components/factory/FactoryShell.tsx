"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { WORKSPACE_PICKER, landingPathFor } from "@/lib/routing";
import { Spinner } from "@/components/ui/Spinner";

const TABS = [
  { href: "/factory", label: "Dashboard" },
  { href: "/factory/materials", label: "Materials" },
  { href: "/factory/boms", label: "Bill of Materials" },
  { href: "/factory/work-orders", label: "Work Orders" },
] as const;

/**
 * Shared chrome for every /factory page — mirrors the Executive Company
 * Dashboard's bespoke header (not the brand workspace's Sidebar/Header,
 * which is full of brand-specific nav this standalone module has no use
 * for) plus a tab strip for its own sub-sections.
 */
export function FactoryShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, brandCode, isLoading: isSessionLoading } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!isSessionLoading && role && !isAdmin) router.replace(landingPathFor(role, brandCode));
  }, [isSessionLoading, isAdmin, role, brandCode, router]);

  if (isSessionLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.14),_transparent_28%),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 px-4 py-5 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">{t("Factory & Manufacturing")}</p>
          </div>
          <Link
            href={WORKSPACE_PICKER}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {t("Workspaces")}
          </Link>
        </div>
        <nav className="mx-auto mt-4 flex max-w-7xl flex-wrap gap-1.5">
          {TABS.map((tab) => {
            const active = tab.href === "/factory" ? pathname === "/factory" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  active
                    ? "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }
              >
                {t(tab.label)}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
