import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getReturns, postReturn } from "./returns.controller.js";
import { createReturnSchema } from "./returns.schema.js";

export const returnsRouter = Router();

// Neither route carries a plain brandId the requireBrandAccess middleware can
// check up front: GET is filtered by ?orderId= (the common case, from the
// order detail page) or ?brandId=, and POST's body only has orderItemId.
// Both handlers resolve the relevant brand themselves — see
// getReturns/assertBrandAccessForOrderItem in returns.controller.ts.
returnsRouter.get("/", requireAuth, asyncHandler(getReturns));
returnsRouter.post("/", requireAuth, validateBody(createReturnSchema), asyncHandler(postReturn));
