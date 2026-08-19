import useSWR from "swr";
import { listAllBins } from "@/lib/warehouses";

/** Every bin across the (single) warehouse, flattened with its zone code. */
export function useAllBins() {
  const { data, error, isLoading } = useSWR("all-bins", listAllBins, { revalidateOnFocus: false });
  return { bins: data ?? [], error, isLoading };
}
