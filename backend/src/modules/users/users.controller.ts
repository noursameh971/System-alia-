import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createUser, listUsers, resetPassword, updateUser } from "./users.service.js";
import type { CreateUserInput, ResetPasswordInput, UpdateUserInput } from "./users.schema.js";

/** GET /api/users — admin-only staff directory. */
export async function getUsers(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listUsers());
}

/** POST /api/users — admin-only. Creates an admin (no brand) or warehouse_staff (brand required) account. */
export async function postUser(req: Request, res: Response): Promise<void> {
  const user = await createUser(req.body as CreateUserInput);
  sendSuccess(res, 201, user);
}

/** PATCH /api/users/:userId — admin-only. Partial update of fullName/role/brandId/isActive. */
export async function patchUser(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId ?? "");
  if (!userId) throw ApiError.badRequest("userId is required");

  // requireAuth ran before this handler, so req.user is guaranteed to be set.
  const user = await updateUser(userId, req.user!.id, req.body as UpdateUserInput);
  sendSuccess(res, 200, user);
}

/** PATCH /api/users/:userId/password — admin-only password reset (no current-password check — this is an admin action, not self-service). */
export async function patchUserPassword(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId ?? "");
  if (!userId) throw ApiError.badRequest("userId is required");

  await resetPassword(userId, (req.body as ResetPasswordInput).password);
  sendSuccess(res, 200, { success: true });
}
