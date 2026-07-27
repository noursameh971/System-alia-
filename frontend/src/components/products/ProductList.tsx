"use client";

import useSWR from "swr";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listProducts } from "@/lib/products";
import { ApiError } from "@/lib/apiClient";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCard } from "./ProductCard";

export function ProductList() {
  const { brand } = useWorkspace();

  const {
    data: products,
    error,
    isLoading,
  } = useSWR(["products", brand.id], () => listProducts(brand.id));

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
