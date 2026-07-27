"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { listBrands } from "@/lib/brands";
import { setLastWorkspaceCode } from "@/lib/lastWorkspace";
import type { Brand } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";

interface WorkspaceContextValue {
  /** The brand this entire route subtree is locked to. Always defined for consumers — see WorkspaceProvider. */
  brand: Brand;
  /** Full brand list, for the WorkspaceSwitcher. */
  brands: Brand[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Resolves the brand for this route subtree from the URL's [brand] segment
 * (a lowercased brand code, e.g. "alh") and locks the whole tree to it.
 * Unlike the old BrandContext, there is no setter — the only way to change
 * the active brand is to navigate to a different /[brand]/... URL (see
 * WorkspaceSwitcher). This is the "deeply enforced" part: a component
 * inside here cannot accidentally read or mutate the wrong brand's data
 * because there is no client-side toggle to reach for.
 */
export function WorkspaceProvider({ brandCode, children }: { brandCode: string; children: ReactNode }) {
  const router = useRouter();
  const { data: brands, isLoading } = useSWR("brands", listBrands, { revalidateOnFocus: false });

  const brand = brands?.find((b) => b.code.toLowerCase() === brandCode.toLowerCase());

  useEffect(() => {
    if (!isLoading && brands && !brand) {
      // Unknown brand code in the URL — bounce to the workspace picker
      // rather than rendering a shell locked to nothing.
      router.replace("/");
    }
  }, [isLoading, brands, brand, router]);

  useEffect(() => {
    if (brand) setLastWorkspaceCode(brand.code);
  }, [brand]);

  if (isLoading || !brand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading workspace..." />
      </div>
    );
  }

  return <WorkspaceContext.Provider value={{ brand, brands: brands ?? [] }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
