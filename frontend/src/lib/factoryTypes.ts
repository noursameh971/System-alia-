/**
 * Types for the standalone Factory & Manufacturing module. Kept in their own
 * file rather than folded into types.ts — that file is already large, and
 * this module is self-contained (mirrors the backend's own factory.ts schema
 * file rather than being spread across catalog.ts/pricing.ts/etc).
 */

export interface FactoryMaterialCategory {
  id: string;
  name: string;
  code: string;
}

export interface FactoryLocation {
  id: string;
  name: string;
  kind: "raw_material" | "wip" | "finished_goods" | string;
}

export interface MaterialSummary {
  id: string;
  name: string;
  sku: string;
  unit: string;
  reorderLevel: number;
  isActive: boolean;
  categoryId: string;
  categoryName: string;
  currentCostPerUnit: number | null;
  totalStock: number;
  belowReorderLevel: boolean;
}

export interface MaterialDetail extends MaterialSummary {
  stockByLocation: { locationId: string; locationName: string; quantity: number }[];
  recentMovements: {
    id: string;
    movementType: string;
    quantity: number;
    fromLocationName: string | null;
    toLocationName: string | null;
    notes: string | null;
    createdAt: string;
  }[];
}

export interface CreateMaterialInput {
  categoryId: string;
  name: string;
  unit: string;
  reorderLevel: number;
  initialCostPerUnit?: number;
  initialStock?: { locationId: string; quantity: number };
}

export type MaterialMovementInput =
  | { movementType: "receipt"; toLocationId: string; quantity: number; notes?: string }
  | { movementType: "issue"; fromLocationId: string; quantity: number; notes?: string }
  | { movementType: "return"; toLocationId: string; quantity: number; notes?: string }
  | { movementType: "waste"; fromLocationId: string; quantity: number; notes?: string }
  | { movementType: "adjustment"; locationId: string; newQuantity: number; notes?: string };

export interface ProductionLine {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
}

export interface Machine {
  id: string;
  name: string;
  code: string;
  machineType: string | null;
  status: "idle" | "running" | "maintenance" | "down";
  lineId: string | null;
  lineName: string | null;
  purchaseDate: string | null;
  notes: string | null;
}

export interface StageTemplate {
  id: string;
  name: string;
  defaultSequenceOrder: number;
  defaultLineId: string | null;
}

export interface FinishedGood {
  id: string;
  name: string;
  sku: string;
  unit: string;
  brandId: string | null;
  brandName: string | null;
  linkedVariantId: string | null;
  isActive: boolean;
}

export interface CreateFinishedGoodInput {
  name: string;
  unit?: string;
  brandId: string;
  linkedVariantId?: string;
}

export interface BomListItem {
  id: string;
  finishedGoodId: string;
  finishedGoodName: string;
  brandName: string | null;
  version: number;
  label: string | null;
  status: string;
  outputQuantity: number;
  createdAt: string;
}

export interface BomDetail extends BomListItem {
  notes: string | null;
  lines: {
    id: string;
    materialId: string;
    materialName: string;
    materialUnit: string;
    quantityPerBatch: number;
    wasteAllowancePct: number;
    sequenceOrder: number;
    notes: string | null;
  }[];
  stages: {
    id: string;
    stageTemplateId: string;
    stageName: string;
    sequenceOrder: number;
    standardTimeMinutes: number | null;
    defaultLineId: string | null;
  }[];
}

export interface CreateBomInput {
  finishedGoodId: string;
  label?: string;
  outputQuantity: number;
  notes?: string;
  lines: { materialId: string; quantityPerBatch: number; wasteAllowancePct: number; sequenceOrder: number; notes?: string }[];
  stages: { stageTemplateId: string; sequenceOrder: number; standardTimeMinutes?: number; defaultLineId?: string }[];
}

export interface MaterialRequirement {
  materialId: string;
  materialName: string;
  unit: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortfall: number;
}

export type WorkOrderStatus = "draft" | "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";
export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

export interface WorkOrderListItem {
  id: string;
  orderNumber: string;
  finishedGoodId: string;
  finishedGoodName: string;
  bomVersion: number;
  quantityOrdered: number;
  quantityCompleted: number;
  quantityScrapped: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  lineName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  createdAt: string;
}

export interface WorkOrderDetail extends WorkOrderListItem {
  bomId: string;
  notes: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  stages: {
    id: string;
    stageTemplateId: string;
    stageName: string;
    sequenceOrder: number;
    status: string;
    lineId: string | null;
    machineId: string | null;
  }[];
  materialRequirements: MaterialRequirement[];
  laborLogs: { id: string; workerName: string; hoursWorked: number; quantityProduced: number; logDate: string; createdAt: string }[];
  outputLogs: { id: string; quantityGood: number; quantityScrap: number; scrapReason: string | null; recordedAt: string }[];
  qualityChecks: { id: string; checkedQuantity: number; passedQuantity: number; failedQuantity: number; result: string; checkedAt: string }[];
}

export interface CreateWorkOrderInput {
  finishedGoodId: string;
  bomId: string;
  quantityOrdered: number;
  priority: WorkOrderPriority;
  lineId?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export interface RecordOutputInput {
  stageId?: string;
  quantityGood: number;
  quantityScrap: number;
  scrapReason?: string;
  locationId?: string;
  notes?: string;
}

export interface RecordLaborInput {
  stageId?: string;
  workerName: string;
  hoursWorked: number;
  hourlyRate?: number;
  quantityProduced: number;
  logDate?: string;
  notes?: string;
}

export interface RecordQualityCheckInput {
  stageId?: string;
  checkedQuantity: number;
  passedQuantity: number;
  failedQuantity: number;
  result: "pass" | "fail" | "rework";
  inspectorNotes?: string;
}

export interface FactoryDashboardSummary {
  activeWorkOrders: number;
  materialsBelowReorder: number;
  rawMaterialInventoryValue: number;
  finishedGoodsOnHand: number;
  monthGoodOutput: number;
  monthScrapOutput: number;
}
