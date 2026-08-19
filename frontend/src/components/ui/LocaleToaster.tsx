"use client";

import { Toaster } from "sonner";
import { useLocale } from "@/context/LocaleContext";

/**
 * Sonner's <Toaster> pinned to the *trailing* top corner rather than a fixed
 * physical side — in RTL the natural reading corner is top-left, and toasts
 * stacking over the sidebar there is exactly the collision we're avoiding.
 */
export function LocaleToaster() {
  const { dir } = useLocale();
  return <Toaster position={dir === "rtl" ? "top-left" : "top-right"} dir={dir} richColors closeButton />;
}
