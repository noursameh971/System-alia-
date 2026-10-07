import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  deleteConversationHandler,
  getConversationHandler,
  getStatusHandler,
  listConversationsHandler,
} from "./assistant.controller.js";

export const assistantRouter = Router();

// Admin-only, for every route on this router — applied once here rather
// than per route so a route added later can't forget it. The assistant can
// read every brand's finances and draft writes to them, so finance and
// warehouse_staff get a 403 even though the UI never shows them the entry
// point. requireAuth re-reads role from the DB on each request, so demoting
// or deactivating an admin cuts off assistant access immediately.
assistantRouter.use(requireAuth, requireRole("admin"));

assistantRouter.get("/status", asyncHandler(getStatusHandler));

assistantRouter.get("/conversations", asyncHandler(listConversationsHandler));
assistantRouter.get("/conversations/:id", asyncHandler(getConversationHandler));
assistantRouter.delete("/conversations/:id", asyncHandler(deleteConversationHandler));

// Next (Phase 1, steps 4–5): POST /chat, POST /actions/:id/confirm, POST /actions/:id/reject.
