"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import { listBrands } from "@/lib/brands";
import type { Brand } from "@/lib/types";

const STORAGE_KEY = "alia-noori:selectedBrandId";

// A tiny pub-sub over localStorage so useSyncExternalStore can read the
// persisted brand selection without the classic "read localStorage in a
// useEffect + setState" pattern, which both mismatches SSR/hydration output
// and trips the react-hooks/set-state-in-effect lint rule. Manually
// notifying listeners on write also means this stays in sync if another tab
// changes the selection.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

function persistSelectedBrandId(id: string | null): void {
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((callback) => callback());
}

interface BrandContextValue {
  brands: Brand[];
  isLoading: boolean;
  error: Error | null;
  /** null means "All brands" */
  selectedBrandId: string | null;
  selectedBrand: Brand | null;
  setSelectedBrandId: (id: string | null) => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const { data: brands, error, isLoading } = useSWR("brands", listBrands, { revalidateOnFocus: false });
  const selectedBrandId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selectedBrand = brands?.find((b) => b.id === selectedBrandId) ?? null;

  return (
    <BrandContext.Provider
      value={{
        brands: brands ?? [],
        isLoading,
        error: error ?? null,
        selectedBrandId,
        selectedBrand,
        setSelectedBrandId: persistSelectedBrandId,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within a BrandProvider");
  return ctx;
}
