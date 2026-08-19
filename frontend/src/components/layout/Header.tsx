import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { logout } from "@/lib/auth";
import { getBrandAccentClass, getBrandInitials } from "@/lib/brandColor";
import { Button } from "@/components/ui/button";
import { BuildingIcon, LogoutIcon } from "./icons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { CreateWorkspaceModal } from "./CreateWorkspaceModal";

export function Header() {
  const router = useRouter();
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-wide text-white ${getBrandAccentClass(brand.code)}`}
        >
          {getBrandInitials(brand.name)}
        </span>
        <div className="flex flex-col justify-center leading-tight">
          <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{brand.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("Inventory & Orders")}</p>
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
            <span className="hidden sm:inline">{t("Company Dashboard")}</span>
          </Link>
        ) : null}
        <WorkspaceSwitcher />
        {role === "admin" ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="New workspace"
            title={t("New workspace")}
            onClick={() => setCreateWorkspaceOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sign out"
          title={t("Sign out")}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <LogoutIcon className="h-4 w-4 shrink-0" />
        </button>
      </div>

      {role === "admin" ? <CreateWorkspaceModal open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen} /> : null}
    </header>
  );
}
