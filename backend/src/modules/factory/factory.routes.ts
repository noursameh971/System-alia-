import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createBomHandler,
  createFinishedGoodHandler,
  getBomHandler,
  getBoms,
  getFinishedGoods,
  getMaterialRequirementsHandler,
  updateBomStatusHandler,
} from "./boms.controller.js";
import { createBomSchema, createFinishedGoodSchema, updateBomStatusSchema } from "./boms.schema.js";
import { getFactoryDashboard } from "./dashboard.controller.js";
import {
  createLocationHandler,
  createMaterialCategoryHandler,
  createMaterialHandler,
  getLocations,
  getMaterialCategories,
  getMaterialDetailHandler,
  getMaterials,
  recordMaterialMovementHandler,
  updateMaterialCostHandler,
  updateMaterialHandler,
} from "./materials.controller.js";
import {
  createLocationSchema,
  createMaterialCategorySchema,
  createMaterialSchema,
  materialMovementSchema,
  updateMaterialCostSchema,
  updateMaterialSchema,
} from "./materials.schema.js";
import {
  createMachineHandler,
  createProductionLineHandler,
  createStageTemplateHandler,
  getMachines,
  getProductionLines,
  getStageTemplates,
  updateMachineStatusHandler,
} from "./production.controller.js";
import {
  createMachineSchema,
  createProductionLineSchema,
  createStageTemplateSchema,
  updateMachineStatusSchema,
} from "./production.schema.js";
import {
  createWorkOrderHandler,
  getWorkOrderDetailHandler,
  getWorkOrders,
  issueBomMaterialsHandler,
  recordLaborHandler,
  recordOutputHandler,
  recordQualityCheckHandler,
  updateWorkOrderStatusHandler,
} from "./workOrders.controller.js";
import {
  createWorkOrderSchema,
  issueBomMaterialsSchema,
  recordLaborSchema,
  recordOutputSchema,
  recordQualityCheckSchema,
  updateWorkOrderStatusSchema,
} from "./workOrders.schema.js";

// The entire Factory & Manufacturing module is admin-only, same gate as the
// Executive Company Dashboard — it's a standalone, cross-cutting workspace
// (see factory.ts's schema doc comment), not scoped to a brand's staff.
export const factoryRouter = Router();
factoryRouter.use(requireAuth, requireRole("admin"));

// --- dashboard ---------------------------------------------------------
factoryRouter.get("/dashboard", asyncHandler(getFactoryDashboard));

// --- materials -----------------------------------------------------------
factoryRouter.get("/material-categories", asyncHandler(getMaterialCategories));
factoryRouter.post("/material-categories", validateBody(createMaterialCategorySchema), asyncHandler(createMaterialCategoryHandler));

factoryRouter.get("/locations", asyncHandler(getLocations));
factoryRouter.post("/locations", validateBody(createLocationSchema), asyncHandler(createLocationHandler));

factoryRouter.get("/materials", asyncHandler(getMaterials));
factoryRouter.post("/materials", validateBody(createMaterialSchema), asyncHandler(createMaterialHandler));
factoryRouter.get("/materials/:materialId", asyncHandler(getMaterialDetailHandler));
factoryRouter.patch("/materials/:materialId", validateBody(updateMaterialSchema), asyncHandler(updateMaterialHandler));
factoryRouter.patch("/materials/:materialId/cost", validateBody(updateMaterialCostSchema), asyncHandler(updateMaterialCostHandler));
factoryRouter.post("/materials/:materialId/movements", validateBody(materialMovementSchema), asyncHandler(recordMaterialMovementHandler));

// --- production: lines, machines, stage templates -------------------------
factoryRouter.get("/production-lines", asyncHandler(getProductionLines));
factoryRouter.post("/production-lines", validateBody(createProductionLineSchema), asyncHandler(createProductionLineHandler));

factoryRouter.get("/machines", asyncHandler(getMachines));
factoryRouter.post("/machines", validateBody(createMachineSchema), asyncHandler(createMachineHandler));
factoryRouter.patch("/machines/:machineId/status", validateBody(updateMachineStatusSchema), asyncHandler(updateMachineStatusHandler));

factoryRouter.get("/stage-templates", asyncHandler(getStageTemplates));
factoryRouter.post("/stage-templates", validateBody(createStageTemplateSchema), asyncHandler(createStageTemplateHandler));

// --- finished goods + BOM -------------------------------------------------
factoryRouter.get("/finished-goods", asyncHandler(getFinishedGoods));
factoryRouter.post("/finished-goods", validateBody(createFinishedGoodSchema), asyncHandler(createFinishedGoodHandler));

factoryRouter.get("/boms", asyncHandler(getBoms));
factoryRouter.post("/boms", validateBody(createBomSchema), asyncHandler(createBomHandler));
factoryRouter.get("/boms/:bomId", asyncHandler(getBomHandler));
factoryRouter.patch("/boms/:bomId/status", validateBody(updateBomStatusSchema), asyncHandler(updateBomStatusHandler));
factoryRouter.get("/boms/:bomId/material-requirements", asyncHandler(getMaterialRequirementsHandler));

// --- work orders -----------------------------------------------------------
factoryRouter.get("/work-orders", asyncHandler(getWorkOrders));
factoryRouter.post("/work-orders", validateBody(createWorkOrderSchema), asyncHandler(createWorkOrderHandler));
factoryRouter.get("/work-orders/:workOrderId", asyncHandler(getWorkOrderDetailHandler));
factoryRouter.patch("/work-orders/:workOrderId/status", validateBody(updateWorkOrderStatusSchema), asyncHandler(updateWorkOrderStatusHandler));
factoryRouter.post(
  "/work-orders/:workOrderId/materials/issue",
  validateBody(issueBomMaterialsSchema),
  asyncHandler(issueBomMaterialsHandler),
);
factoryRouter.post("/work-orders/:workOrderId/output", validateBody(recordOutputSchema), asyncHandler(recordOutputHandler));
factoryRouter.post("/work-orders/:workOrderId/labor", validateBody(recordLaborSchema), asyncHandler(recordLaborHandler));
factoryRouter.post(
  "/work-orders/:workOrderId/quality-checks",
  validateBody(recordQualityCheckSchema),
  asyncHandler(recordQualityCheckHandler),
);
