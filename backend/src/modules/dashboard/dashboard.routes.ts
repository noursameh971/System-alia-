import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getDashboardSummaryHandler } from "./dashboard.controller.js";

export const dashboardRouter = Router();

// Cross-brand aggregate view — deliberately admin-only, enforced here (not
// just hidden in the UI), since it's the one place brand isolation is
// intentionally broken.
dashboardRouter.get("/summary", requireAuth, requireRole("admin"), asyncHandler(getDashboardSummaryHandler));
