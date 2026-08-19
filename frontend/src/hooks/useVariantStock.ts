import useSWR from "swr";
import { getVariantInventory } from "@/lib/inventory";

/** Per-bin on-hand quantity for one variant — used to build "from" bin pickers that show real stock. */
export function useVariantStock(variantId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    variantId ? ["variant-inventory", variantId] : null,
    () => getVariantInventory(variantId as string),
    { revalidateOnFocus: false },
  );
  return { stock: data ?? [], error, isLoading, refresh: mutate };
}
