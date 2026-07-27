import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUsers, postUser } from "./users.controller.js";
import { createUserSchema } from "./users.schema.js";

export const usersRouter = Router();

// Staff management is admin-only — a warehouse_staff account has no
// business seeing (or creating) other accounts.
usersRouter.get("/", requireAuth, requireRole("admin"), asyncHandler(getUsers));
usersRouter.post("/", requireAuth, requireRole("admin"), validateBody(createUserSchema), asyncHandler(postUser));
