"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Boxes, SlidersHorizontal, Users } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { workspaceHomePath } from "@/lib/routing";
import { Spinner } from "@/components/ui/Spinner";
import { UserManagementTab } from "@/components/settings/UserManagementTab";
import { GeneralLanguageTab } from "@/components/settings/GeneralLanguageTab";
import { InventoryRulesTab } from "@/components/settings/InventoryRulesTab";
import { DangerZoneTab } from "@/components/settings/DangerZoneTab";

const SECTIONS = [
  {
    key: "general",
    label: "General & Language",
    description: "Language, brand identity, currency",
    icon: SlidersHorizontal,
  },
  {
    key: "users",
    label: "User Management",
    description: "Staff accounts, roles, access",
    icon: Users,
  },
  {
    key: "inventory",
    label: "Inventory Rules",
    description: "Stock alerts",
    icon: Boxes,
  },
  {
    key: "danger",
    label: "Danger Zone",
    description: "Reset all data",
    icon: AlertTriangle,
  },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function BrandSettingsPage() {
  const router = useRouter();
  const { brand } = useWorkspace();
  const { role, isLoading: isSessionLoading } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";
  const [section, setSection] = useState<SectionKey>("general");

  useEffect(() => {
    if (!isSessionLoading && !isAdmin) router.replace(workspaceHomePath(brand.code));
  }, [isSessionLoading, isAdmin, brand.code, router]);

  if (isSessionLoading || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t("Settings")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {brand.name} · {t("Workspace configuration")}
        </p>
      </div>

      {/* Vertical rail on desktop, horizontal scroll strip under ~1024px —
          the rail's 232px column would eat half a phone's width otherwise. */}
      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label={t("Settings")}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const selected = item.key === section;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                aria-current={selected ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl border px-3.5 py-3 text-start transition-colors lg:w-full lg:shrink ${
                  selected
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-sm font-medium lg:whitespace-normal">
                    {t(item.label)}
                  </span>
                  <span
                    className={`mt-0.5 hidden text-xs lg:block ${
                      selected ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {t(item.description)}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="lg:hidden">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t(active.label)}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(active.description)}</p>
          </div>

          {section === "general" ? <GeneralLanguageTab /> : null}
          {section === "users" ? <UserManagementTab /> : null}
          {section === "inventory" ? <InventoryRulesTab /> : null}
          {section === "danger" ? <DangerZoneTab /> : null}
        </div>
      </div>
    </div>
  );
}
