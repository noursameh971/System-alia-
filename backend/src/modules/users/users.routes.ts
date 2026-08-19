import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUsers, patchUser, patchUserPassword, postUser } from "./users.controller.js";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schema.js";

export const usersRouter = Router();

// Staff management is admin-only — a warehouse_staff account has no
// business seeing (or managing) other accounts.
usersRouter.get("/", requireAuth, requireRole("admin"), asyncHandler(getUsers));
usersRouter.post("/", requireAuth, requireRole("admin"), validateBody(createUserSchema), asyncHandler(postUser));
usersRouter.patch(
  "/:userId",
  requireAuth,
  requireRole("admin"),
  validateBody(updateUserSchema),
  asyncHandler(patchUser),
);
usersRouter.patch(
  "/:userId/password",
  requireAuth,
  requireRole("admin"),
  validateBody(resetPasswordSchema),
  asyncHandler(patchUserPassword),
);
