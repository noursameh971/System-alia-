"use client";

import { useBrand } from "@/context/BrandContext";
import { ChevronDownIcon } from "./icons";

const ALL_BRANDS_VALUE = "__all__";

export function BrandToggle() {
  const { brands, selectedBrandId, setSelectedBrandId, isLoading } = useBrand();

  return (
    <div className="relative">
      <select
        aria-label="Brand"
        disabled={isLoading}
        value={selectedBrandId ?? ALL_BRANDS_VALUE}
        onChange={(e) => setSelectedBrandId(e.target.value === ALL_BRANDS_VALUE ? null : e.target.value)}
        className="appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm font-medium
          text-slate-800 shadow-sm disabled:opacity-50
          dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value={ALL_BRANDS_VALUE}>All Brands</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
