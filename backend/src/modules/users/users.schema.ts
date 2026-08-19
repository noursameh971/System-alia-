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

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150).optional(),
    role: z.enum(["admin", "warehouse_staff"]).optional(),
    // Explicit null clears the assignment (switching to admin); omitted
    // leaves it unchanged; a uuid string (re)assigns it. Full role/brand
    // cross-validation against the *existing* row happens in
    // users.service.ts#updateUser, since a partial update (e.g. isActive
    // only) needs the current role to validate against.
    brandId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update" })
  .refine((data) => !(data.role === "admin" && data.brandId), {
    message: "brandId must be omitted for 'admin'",
    path: ["brandId"],
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
