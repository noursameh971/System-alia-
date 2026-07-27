import { ProductList } from "@/components/products/ProductList";

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Products</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          This workspace&apos;s catalog. Each variant has a Generate QR action for printing sticker labels.
        </p>
      </div>
      <ProductList />
    </div>
  );
}
