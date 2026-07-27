import type { Product } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { VariantRow } from "./VariantRow";

export function ProductCard({
  product,
  selectMode = false,
  selectedSkus,
  onToggleSelect,
}: {
  product: Product;
  selectMode?: boolean;
  selectedSkus?: Set<string>;
  onToggleSelect?: (sku: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{product.name}</h3>
          {product.description ? (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{product.description}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Badge>{product.category.name}</Badge>
        </div>
      </div>

      <div className="mt-3">
        {product.variants.map((variant) => (
          <VariantRow
            key={variant.id}
            variant={variant}
            selectable={selectMode}
            selected={selectedSkus?.has(variant.sku) ?? false}
            onToggleSelect={() => onToggleSelect?.(variant.sku)}
          />
        ))}
      </div>
    </div>
  );
}
