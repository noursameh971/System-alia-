"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { listBrands } from "@/lib/brands";
import { getBrandAccentClass, getBrandInitials } from "@/lib/brandColor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { logout } from "@/lib/auth";
import { PLATFORM_CAPTION, PLATFORM_NAME } from "@/lib/platform";
import { ADMIN_LANDING, workspaceHomePath } from "@/lib/routing";
import { Spinner } from "@/components/ui/Spinner";
import { BuildingIcon, LogoutIcon } from "@/components/layout/icons";

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

  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{PLATFORM_NAME}</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{t(PLATFORM_CAPTION)}</p>
      </div>

      <div className="w-full max-w-xl">
        <p className="mb-4 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
          {t("Choose a workspace to continue")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(brands ?? []).map((brand) => (
            <Link
              key={brand.id}
              href={workspaceHomePath(brand.code)}
              className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-colors hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold tracking-wide text-white ${getBrandAccentClass(brand.code)}`}
              >
                {getBrandInitials(brand.name)}
              </span>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{brand.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {role === "admin" ? (
          <Link
            href={ADMIN_LANDING}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <BuildingIcon className="h-4 w-4" />
            {t("Company Dashboard")}
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
    </div>
  );
}
