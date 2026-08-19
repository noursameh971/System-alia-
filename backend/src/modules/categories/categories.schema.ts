import { z } from "zod";

/** The "Manage Categories" modal's rename action. */
export const renameCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(100),
});

export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;
