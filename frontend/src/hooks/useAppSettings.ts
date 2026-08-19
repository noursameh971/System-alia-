import useSWR from "swr";
import { getSettings } from "@/lib/settings";

/** The single global settings row — shared SWR cache key so every consumer (Stock Levels' low-stock badge, the Settings page, LocaleContext's server-default fallback) reads/revalidates the same data. */
export function useAppSettings() {
  const { data, error, isLoading, mutate } = useSWR("app-settings", getSettings, { revalidateOnFocus: false });
  return { settings: data, error, isLoading, mutate };
}
