import { Router } from "express";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postLogin } from "./auth.controller.js";
import { loginSchema } from "./auth.schema.js";

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), asyncHandler(postLogin));
