import { Router } from "express";
import { env } from "../../config/env.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postDevLogin, postLogin } from "./auth.controller.js";
import { loginSchema } from "./auth.schema.js";

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), asyncHandler(postLogin));

// Only ever registered outside production — a stray env var flip can't
// resurrect this route on a deployed instance, because the route object
// itself is never created there.
if (env.NODE_ENV !== "production") {
  authRouter.post("/dev-login", asyncHandler(postDevLogin));
}
