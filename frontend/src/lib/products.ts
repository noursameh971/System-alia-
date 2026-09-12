import { apiFetch, apiFetchBlob, apiFetchUpload } from "./apiClient";
import type {
  BulkDeleteProductsResult,
  BulkUpdateCategoryResult,
  DeleteVariantResult,
  ImportProductsResult,
  Product,
  QuickCreateProductInput,
  QuickCreateProductResult,
  SetVariantStockResult,
  UpdateProductCategoryResult,
  UpdateProductCostResult,
  UpdateProductPriceResult,
  UpdateProductVariantInput,
  UpdateProductVariantResult,
  UploadProductImageResult,
} from "./types";

export function listProducts(brandId: string | null): Promise<Product[]> {
  const query = brandId ? `?brandId=${encodeURIComponent(brandId)}` : "";
  return apiFetch<Product[]>(`/api/products${query}`);
}

/** Backs the "+ Add Product" modal. */
export function createQuickProduct(input: QuickCreateProductInput): Promise<QuickCreateProductResult> {
  return apiFetch<QuickCreateProductResult>("/api/products/quick", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Backs the Edit modal's save action. */
export function updateProductVariant(
  variantId: string,
  input: UpdateProductVariantInput,
): Promise<UpdateProductVariantResult> {
  return apiFetch<UpdateProductVariantResult>(`/api/products/variants/${encodeURIComponent(variantId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Backs the row dropdown's Delete action. */
export function deleteProductVariant(variantId: string): Promise<DeleteVariantResult> {
  return apiFetch<DeleteVariantResult>(`/api/products/variants/${encodeURIComponent(variantId)}`, {
    method: "DELETE",
  });
}

/** Backs the Product Profile drawer's inline stock editor — `quantity` is the new total, not a delta. */
export function setVariantStock(variantId: string, quantity: number): Promise<SetVariantStockResult> {
  return apiFetch<SetVariantStockResult>(`/api/products/variants/${encodeURIComponent(variantId)}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

/** Backs the Product Profile drawer's "Update Product Price" field — sets one price across every variant of the product. */
export function updateProductPrice(productId: string, price: number): Promise<UpdateProductPriceResult> {
  return apiFetch<UpdateProductPriceResult>(`/api/products/${encodeURIComponent(productId)}/price`, {
    method: "PATCH",
    body: JSON.stringify({ price }),
  });
}

/** Backs the Product Profile drawer's "Update Production Cost" field — sets one cost across every variant of the product. */
export function updateProductCost(productId: string, cost: number): Promise<UpdateProductCostResult> {
  return apiFetch<UpdateProductCostResult>(`/api/products/${encodeURIComponent(productId)}/cost`, {
    method: "PATCH",
    body: JSON.stringify({ cost }),
  });
}

/** Backs the Product Profile drawer's Category selector — get-or-creates by name and applies it to the whole product. */
export function updateProductCategory(productId: string, category: string): Promise<UpdateProductCategoryResult> {
  return apiFetch<UpdateProductCategoryResult>(`/api/products/${encodeURIComponent(productId)}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category }),
  });
}

/** Backs the products table's bulk-select "Set Category" action — one get-or-created category applied to every selected product. */
export function bulkUpdateProductsCategory(productIds: string[], category: string): Promise<BulkUpdateCategoryResult> {
  return apiFetch<BulkUpdateCategoryResult>("/api/products/bulk/category", {
    method: "PATCH",
    body: JSON.stringify({ productIds, category }),
  });
}

/**
 * Backs the products table's bulk-select "Delete Selected" action. Products
 * with order/stock history on any variant come back archived rather than
 * removed — see the backend's bulkDeleteProducts.
 *
 * The 20s timeout matters specifically here: this button's confirm dialog
 * shows a "Deleting..." state that only clears when the request settles
 * (resolves or rejects) — a network stall with no timeout would otherwise
 * leave that state stuck indefinitely instead of surfacing an error.
 */
export function bulkDeleteProducts(productIds: string[]): Promise<BulkDeleteProductsResult> {
  // Temporary debug instrumentation — remove once bulk delete is confirmed
  // working end-to-end. Logs the resolved API base URL too, since a wrong
  // NEXT_PUBLIC_API_URL (pointing at the wrong backend/port/deployment) is a
  // classic cause of "the request silently goes nowhere."
  console.log("[bulk-delete] apiFetch DELETE /api/products/bulk", { productIds, apiBaseUrl: process.env.NEXT_PUBLIC_API_URL });
  return apiFetch<BulkDeleteProductsResult>("/api/products/bulk", {
    method: "DELETE",
    body: JSON.stringify({ productIds }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Backs the "Export Excel" button — a full .xlsx of every product/variant/SKU/price/stock. */
export function exportProductsWorkbook(brandId: string): Promise<Blob> {
  return apiFetchBlob(`/api/products/export?brandId=${encodeURIComponent(brandId)}`);
}

/** Backs the "Import Excel" button — uploads a .xlsx to create products or bulk-update price/stock. */
export function importProductsWorkbook(brandId: string, file: File): Promise<ImportProductsResult> {
  return apiFetchUpload<ImportProductsResult>(`/api/products/import?brandId=${encodeURIComponent(brandId)}`, file);
}

/** Backs the Add/Edit modal's file-upload image path — the file's raw bytes, not JSON. Sets the product's image directly server-side and returns the resulting URL. */
export function uploadProductImage(productId: string, file: File): Promise<UploadProductImageResult> {
  return apiFetchUpload<UploadProductImageResult>(`/api/products/${encodeURIComponent(productId)}/image`, file);
}
