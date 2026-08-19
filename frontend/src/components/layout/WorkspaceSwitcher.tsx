"use client";

import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ChevronDownIcon } from "./icons";

/**
 * Replaces the old global "All Brands" dropdown. Switching workspace here
 * is a real navigation, not a state mutation — it moves you to the
 * equivalent page under the other brand's /[brand]/... route, dropping any
 * brand-specific deep segment (e.g. a specific order id) that wouldn't
 * make sense to carry over.
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { brand, brands } = useWorkspace();

  function handleChange(newCode: string) {
    const segments = pathname.split("/").filter(Boolean); // ["alh", "orders", "<id>"]
    const topLevelSection = segments[1] ?? "products"; // "orders" — drop anything deeper
    router.push(`/${newCode.toLowerCase()}/${topLevelSection}`);
  }

  return (
    <div className="relative">
      <select
        aria-label="Workspace switcher"
        value={brand.id}
        onChange={(e) => {
          const next = brands.find((b) => b.id === e.target.value);
          if (next) handleChange(next.code);
        }}
        className="appearance-none rounded-lg border border-slate-300 bg-white py-2 ps-3 pe-9 text-sm font-medium
          text-slate-800 shadow-sm
          dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
