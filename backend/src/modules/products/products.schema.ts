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
  variants: z.array(variantInputSchema).min(1, "A product needs at least one variant"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const listProductsQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
