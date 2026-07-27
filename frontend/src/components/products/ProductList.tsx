"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listProducts } from "@/lib/products";
import { ApiError } from "@/lib/apiClient";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCard } from "./ProductCard";
import { BatchLabelPrintView, type PrintableVariant } from "./BatchLabelPrintView";

export function ProductList() {
  const { brand } = useWorkspace();

  const {
    data: products,
    error,
    isLoading,
  } = useSWR(["products", brand.id], () => listProducts(brand.id));

  const [selectMode, setSelectMode] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  const selectedVariants = useMemo<PrintableVariant[]>(() => {
    if (!products) return [];
    return products.flatMap((product) =>
      product.variants
        .filter((variant) => selectedSkus.has(variant.sku))
        .map((variant) => ({ sku: variant.sku, productName: product.name, attributes: variant.attributes })),
    );
  }, [products, selectedSkus]);

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelectedSkus(new Set());
  }

  function toggleSku(sku: string) {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading products..." />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load products"
        description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
      />
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState
        title="No products yet"
        description="Products created for this workspace will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleSelectMode}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {selectMode ? "Cancel" : "Print Labels"}
        </button>

        {selectMode ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">{selectedSkus.size} selected</span>
            <button
              type="button"
              onClick={() => setPrinting(true)}
              disabled={selectedSkus.size === 0}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Print {selectedSkus.size || ""} label{selectedSkus.size === 1 ? "" : "s"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            selectMode={selectMode}
            selectedSkus={selectedSkus}
            onToggleSelect={toggleSku}
          />
        ))}
      </div>

      {printing ? <BatchLabelPrintView variants={selectedVariants} onClose={() => setPrinting(false)} /> : null}
    </div>
  );
}
