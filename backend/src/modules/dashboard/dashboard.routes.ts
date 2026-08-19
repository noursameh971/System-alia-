import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getBrandDashboardSummaryHandler, getDashboardSummaryHandler } from "./dashboard.controller.js";

export const dashboardRouter = Router();

// Cross-brand aggregate view — deliberately admin-only, enforced here (not
// just hidden in the UI), since it's the one place brand isolation is
// intentionally broken.
dashboardRouter.get("/summary", requireAuth, requireRole("admin"), asyncHandler(getDashboardSummaryHandler));

// The brand-scoped dashboard page — respects normal brand isolation, so
// both roles can hit it for their own workspace (requireBrandAccess is a
// no-op for admins, who aren't scoped to one brand).
dashboardRouter.get("/brand-summary", requireAuth, requireBrandAccess("query"), asyncHandler(getBrandDashboardSummaryHandler));
