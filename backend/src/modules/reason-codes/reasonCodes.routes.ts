import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getReasonCodes } from "./reasonCodes.controller.js";

export const reasonCodesRouter = Router();

reasonCodesRouter.get("/", requireAuth, asyncHandler(getReasonCodes));
