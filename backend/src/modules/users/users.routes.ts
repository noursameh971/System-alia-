import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  deleteUserHandler,
  getUsers,
  patchOwnPassword,
  patchUser,
  patchUserPassword,
  postUser,
} from "./users.controller.js";
import { changeOwnPasswordSchema, createUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schema.js";

export const usersRouter = Router();

// Staff management is admin-only — a warehouse_staff account has no
// business seeing (or managing) other accounts.
usersRouter.get("/", requireAuth, requireRole("admin"), asyncHandler(getUsers));
usersRouter.post("/", requireAuth, requireRole("admin"), validateBody(createUserSchema), asyncHandler(postUser));

// Must be registered before "/:userId/password" — otherwise Express would
// match "me" as :userId and hit the admin-only route below instead, 403ing
// every non-admin who tries to change their own password.
usersRouter.patch(
  "/me/password",
  requireAuth,
  validateBody(changeOwnPasswordSchema),
  asyncHandler(patchOwnPassword),
);

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
usersRouter.delete("/:userId", requireAuth, requireRole("admin"), asyncHandler(deleteUserHandler));
