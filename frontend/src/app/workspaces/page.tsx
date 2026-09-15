"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import { Factory, Trash2 } from "lucide-react";
import { deleteBrand, listBrands } from "@/lib/brands";
import { getBrandAccentClass, getBrandInitials } from "@/lib/brandColor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { logout } from "@/lib/auth";
import { ApiError } from "@/lib/apiClient";
import { PLATFORM_CAPTION, PLATFORM_NAME } from "@/lib/platform";
import { ADMIN_LANDING, FACTORY_LANDING, workspaceHomePath } from "@/lib/routing";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BuildingIcon, LogoutIcon } from "@/components/layout/icons";
import type { Brand } from "@/lib/types";

/**
 * The workspace picker, moved off "/" so that "/" can be a pure role-based
 * redirector. Deliberately does NOT auto-jump to the last-used workspace
 * any more: arriving here is now an explicit "let me choose" action (from
 * the Executive Dashboard's Workspaces link), and silently bouncing away
 * from a page someone navigated to on purpose is the bug that behaviour
 * would reintroduce.
 */
export default function WorkspacesPage() {
  const router = useRouter();
  const { data: brands, isLoading } = useSWR("brands", listBrands, { revalidateOnFocus: false });
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";

  const [pendingDelete, setPendingDelete] = useState<Brand | null>(null);

  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    try {
      const result = await deleteBrand(pendingDelete.id);
      // Matches CreateWorkspaceModal's sibling toast: the brand name itself
      // isn't run through t(), same convention used there.
      toast.success(
        result.deleted
          ? `Workspace "${pendingDelete.name}" deleted`
          : `Workspace "${pendingDelete.name}" archived — it still has products, orders, or staff attached`,
      );
      void globalMutate("brands");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to delete workspace"));
      throw err;
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{PLATFORM_NAME}</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{t(PLATFORM_CAPTION)}</p>
      </div>

      <div className="w-full max-w-xl">
        <p className="mb-5 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("Choose a workspace to continue")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(brands ?? []).map((brand) => (
            <div
              key={brand.id}
              className="group relative rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <Link
                href={workspaceHomePath(brand.code)}
                className="flex flex-col items-center gap-3 p-7 text-center"
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-semibold tracking-wide text-white ${getBrandAccentClass(brand.code)}`}
                >
                  {getBrandInitials(brand.name)}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{brand.name}</span>
              </Link>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPendingDelete(brand);
                  }}
                  aria-label={t("Delete workspace")}
                  title={t("Delete workspace")}
                  className="absolute end-3 top-3 flex size-7 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5">
        {isAdmin ? (
          <Link
            href={ADMIN_LANDING}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <BuildingIcon className="h-4 w-4" />
            {t("Company Dashboard")}
          </Link>
        ) : null}
        {isAdmin ? (
          <Link
            href={FACTORY_LANDING}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Factory className="h-4 w-4" />
            {t("Factory")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <LogoutIcon className="h-4 w-4" />
          {t("Sign out")}
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("Delete workspace")}
        description={
          pendingDelete
            ? `${t("Remove")} "${pendingDelete.name}"? ${t("Workspaces with existing products, orders, or staff are archived instead of erased.")}`
            : ""
        }
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
