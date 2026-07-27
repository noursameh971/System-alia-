import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getBrandAccentClass } from "@/lib/brandColor";
import { BuildingIcon } from "./icons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Header() {
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white ${getBrandAccentClass(brand.code)}`}
        >
          {brand.code}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{brand.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Inventory &amp; Orders</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {role === "admin" ? (
          <Link
            href="/dashboard"
            aria-label="Company Dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:px-3 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <BuildingIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Company Dashboard</span>
          </Link>
        ) : null}
        <WorkspaceSwitcher />
      </div>
    </header>
  );
}
