"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { listBrands } from "@/lib/brands";
import { useLastWorkspaceCode } from "@/hooks/useLastWorkspaceCode";
import { getBrandAccentClass } from "@/lib/brandColor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout } from "@/lib/auth";
import { Spinner } from "@/components/ui/Spinner";
import { BuildingIcon, LogoutIcon } from "@/components/layout/icons";

export default function Home() {
  const router = useRouter();
  const { data: brands, isLoading } = useSWR("brands", listBrands, { revalidateOnFocus: false });
  const { role } = useCurrentUser();
  const lastCode = useLastWorkspaceCode();

  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }

  const matchedBrand = brands?.find((b) => lastCode && b.code.toLowerCase() === lastCode.toLowerCase()) ?? null;

  useEffect(() => {
    if (matchedBrand) router.replace(`/${matchedBrand.code.toLowerCase()}/products`);
  }, [matchedBrand, router]);

  // Also true while matchedBrand is set and we're about to navigate away —
  // avoids a flash of the picker for a returning user before the redirect fires.
  if (isLoading || matchedBrand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Alia Hijab &amp; Noori</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Choose a workspace to continue</p>
      </div>

      <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        {(brands ?? []).map((b) => (
          <Link
            key={b.id}
            href={`/${b.code.toLowerCase()}/products`}
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-colors hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold text-white ${getBrandAccentClass(b.code)}`}
            >
              {b.code}
            </span>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{b.name}</span>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-4">
        {role === "admin" ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <BuildingIcon className="h-4 w-4" />
            View Company Dashboard
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <LogoutIcon className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
