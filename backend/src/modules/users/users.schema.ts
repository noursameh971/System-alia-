import { z } from "zod";

export const createUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["admin", "warehouse_staff"]),
    // Required for warehouse_staff (their one workspace), forbidden for
    // admin (never scoped to a single brand) — see the refine below.
    brandId: z.string().uuid().optional(),
  })
  .refine((data) => (data.role === "warehouse_staff" ? !!data.brandId : !data.brandId), {
    message: "brandId is required when role is 'warehouse_staff', and must be omitted for 'admin'",
    path: ["brandId"],
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
