"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import { Download, Plus, Search, Upload, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { listCategories } from "@/lib/categories";
import { listProducts, exportProductsWorkbook } from "@/lib/products";
import { ApiError } from "@/lib/apiClient";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProductsGroupedTable } from "./ProductsGroupedTable";
import { ProductProfileDrawer } from "./ProductProfileDrawer";
import { AddProductModal } from "./AddProductModal";
import { BulkCategoryModal } from "./BulkCategoryModal";
import { ImportProductsModal } from "./ImportProductsModal";

export function ProductList() {
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const canManage = role === "admin";

  const {
    data: products,
    error,
    isLoading,
    mutate,
  } = useSWR(["products", brand.id], () => listProducts(brand.id));
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Re-derived from the live SWR data on every render (not stored/synced via
  // an effect) so the drawer always reflects the latest mutate() — and so
  // that if the open product's last variant gets deleted, it naturally
  // resolves to null (closing the drawer) instead of showing stale data.
  const selectedProduct = selectedProductId ? (products?.find((p) => p.id === selectedProductId) ?? null) : null;

  function toggleOne(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleMany(productIds: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of productIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function handleCategoriesChanged() {
    void mutate();
    void globalMutate("categories");
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportProductsWorkbook(brand.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `products-${brand.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to export products");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-slate-900 sm:shrink-0 dark:text-slate-100">{t("Products")}</h1>

        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search product, category, color, or SKU")}
            className="ps-8"
          />
        </div>

        <Select
          aria-label={t("Filter by category")}
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          wrapperClassName="w-full sm:w-48 sm:shrink-0"
        >
          <option value="">{t("All Categories")}</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Button variant="outline" onClick={() => void handleExport()} disabled={exporting} className="sm:shrink-0">
          <Download className="size-4" />
          {exporting ? t("Exporting...") : t("Export Excel")}
        </Button>

        {canManage ? (
          <Button variant="outline" onClick={() => setImportOpen(true)} className="sm:shrink-0">
            <Upload className="size-4" />
            {t("Import Excel")}
          </Button>
        ) : null}

        {canManage ? (
          <Button onClick={() => setAddOpen(true)} className="sm:shrink-0">
            <Plus className="size-4" />
            {t("Add Product")}
          </Button>
        ) : null}
      </div>

      {canManage && selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
            {selectedIds.size} {t(selectedIds.size === 1 ? "product selected" : "products selected")}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBulkCategoryOpen(true)}>
              {t("Set Category")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="size-3.5" />
              {t("Clear")}
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading products..." />
        </div>
      ) : error ? (
        <EmptyState
          title={t("Couldn't load products")}
          description={error instanceof ApiError ? error.message : t("Check that the backend API is running.")}
        />
      ) : !products || products.length === 0 ? (
        <EmptyState
          title={t("No products yet")}
          description={
            canManage
              ? t('Click "Add Product" above to create your first one.')
              : t("Products created for this workspace will show up here.")
          }
        />
      ) : (
        <ProductsGroupedTable
          products={products}
          search={search}
          categoryFilter={categoryFilter}
          onOpenProduct={(product) => setSelectedProductId(product.id)}
          canManageCategory={canManage}
          onProductUpdated={handleCategoriesChanged}
          selection={canManage ? { selectedIds, onToggleOne: toggleOne, onToggleMany: toggleMany } : undefined}
        />
      )}

      <AddProductModal open={addOpen} onOpenChange={setAddOpen} brandId={brand.id} onSuccess={() => mutate()} />

      <ImportProductsModal open={importOpen} onOpenChange={setImportOpen} brandId={brand.id} onSuccess={() => mutate()} />

      <ProductProfileDrawer
        product={selectedProduct}
        onOpenChange={(open) => !open && setSelectedProductId(null)}
        canManage={canManage}
        onMutate={() => mutate()}
      />

      <BulkCategoryModal
        open={bulkCategoryOpen}
        onOpenChange={setBulkCategoryOpen}
        productIds={[...selectedIds]}
        onSuccess={() => {
          handleCategoriesChanged();
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
