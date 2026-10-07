import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { chatRateLimit } from "./assistant.rateLimit.js";
import { chatBodySchema, confirmActionBodySchema } from "./assistant.schema.js";
import {
  chatHandler,
  confirmActionHandler,
  deleteConversationHandler,
  getConversationHandler,
  getStatusHandler,
  listConversationsHandler,
  rejectActionHandler,
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

// One chat turn: Claude reads data through typed tools and may draft
// expenses/revenue, which come back as actions for the UI to show as
// confirmation cards. Nothing is written to the books here.
assistantRouter.post("/chat", chatRateLimit, validateBody(chatBodySchema), asyncHandler(chatHandler));

// The only path by which an assistant draft becomes a real record.
assistantRouter.post("/actions/:id/confirm", validateBody(confirmActionBodySchema), asyncHandler(confirmActionHandler));
assistantRouter.post("/actions/:id/reject", asyncHandler(rejectActionHandler));
