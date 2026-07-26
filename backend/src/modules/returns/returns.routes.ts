import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getReturns, postReturn } from "./returns.controller.js";
import { createReturnSchema } from "./returns.schema.js";

export const returnsRouter = Router();

returnsRouter.get("/", requireAuth, asyncHandler(getReturns));
returnsRouter.post("/", requireAuth, validateBody(createReturnSchema), asyncHandler(postReturn));
