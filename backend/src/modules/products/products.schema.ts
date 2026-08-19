import { z } from "zod";

const variantInputSchema = z.object({
  attributeValueIds: z
    .array(z.string().uuid())
    .min(1, "Each variant needs at least one attribute value (e.g. a color)"),
  price: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
});

export const createProductSchema = z.object({
  brandId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  variants: z.array(variantInputSchema).min(1, "A product needs at least one variant"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const listProductsQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

const quickVariantInputSchema = z.object({
  color: z.string().trim().min(1, "Color is required").max(50),
  size: z.string().trim().min(1, "Size is required").max(50),
  price: z.number().positive("Price must be greater than 0"),
  /** Production/unit cost — optional (cost tracking is opt-in), 0 is a legitimate value unlike price. */
  cost: z.number().nonnegative("Cost can't be negative").optional(),
  initialStock: z.number().int().min(0, "Initial stock can't be negative").max(1_000_000).default(0),
});

/**
 * Simplified create path for the Products page's "+ Add Product" modal —
 * one product with one or more (color, size) variants, instead of the
 * general-purpose createProductSchema above (which needs real
 * category/attribute-value ids the modal doesn't collect). Color/Size are
 * free text here; the service resolves/creates the matching attribute value
 * rows so the catalog still uses the shared attributes model underneath.
 * The product itself is get-or-created by (brandId, name) — submitting the
 * same name again adds more variants to that product instead of failing on
 * the products_brand_id_name_key unique constraint.
 */
export const quickCreateProductSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1, "Product name is required").max(200),
  /** Free text — get-or-created by name, same as color/size. Omitted or blank falls back to the default "General" category. */
  category: z.string().trim().max(100).optional(),
  /** An external URL (typed in) or a path returned by the image-upload endpoint (e.g. "/uploads/products/xyz.jpg") — not validated as a strict URL so relative upload paths are accepted too. */
  imageUrl: z.string().trim().max(500).optional(),
  variants: z
    .array(quickVariantInputSchema)
    .min(1, "Add at least one variant")
    .max(50, "Add variants in smaller batches")
    .refine(
      (variants) => {
        const signatures = variants.map((v) => `${v.color.trim().toLowerCase()}|${v.size.trim().toLowerCase()}`);
        return new Set(signatures).size === signatures.length;
      },
      { message: "Each variant needs a distinct color/size combination" },
    ),
});

export type QuickCreateProductInput = z.infer<typeof quickCreateProductSchema>;
export type QuickVariantInput = z.infer<typeof quickVariantInputSchema>;

export const updateProductVariantSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    color: z.string().trim().min(1).max(50).optional(),
    size: z.string().trim().min(1).max(50).optional(),
    price: z.number().positive("Price must be greater than 0").optional(),
    cost: z.number().nonnegative("Cost can't be negative").optional(),
    status: z.enum(["active", "discontinued"]).optional(),
    /** Product-level field, same as name/category — an empty string explicitly clears the image (distinct from omitting the field, which leaves it untouched). */
    imageUrl: z.string().trim().max(500).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;

/** The Product Profile drawer's inline stock editor sends the *target* total, not a delta. */
export const setVariantStockSchema = z.object({
  quantity: z.number().int().min(0, "Stock can't be negative").max(1_000_000),
});

export type SetVariantStockInput = z.infer<typeof setVariantStockSchema>;

/** The Product Profile drawer's "Update Product Price" field — applies one price to every variant of the product. */
export const updateProductPriceSchema = z.object({
  price: z.number().positive("Price must be greater than 0"),
});

export type UpdateProductPriceInput = z.infer<typeof updateProductPriceSchema>;

/** The Product Profile drawer's "Update Production Cost" field — applies one cost to every variant of the product, same fan-out semantics as price. */
export const updateProductCostSchema = z.object({
  cost: z.number().nonnegative("Cost can't be negative"),
});

export type UpdateProductCostInput = z.infer<typeof updateProductCostSchema>;

/** The Product Profile drawer's Category selector — free text, get-or-created by name like the quick-add form's category field. */
export const updateProductCategorySchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(100),
});

export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>;

/** The products table's bulk-select "Set Category" action — applies one category to every selected product. */
export const bulkUpdateCategorySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, "Select at least one product"),
  category: z.string().trim().min(1, "Category is required").max(100),
});

export type BulkUpdateCategoryInput = z.infer<typeof bulkUpdateCategorySchema>;
