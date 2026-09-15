import { apiFetch } from "./apiClient";
import type {
  BomDetail,
  BomListItem,
  CostingReportRow,
  CreateBomInput,
  CreateFinishedGoodInput,
  CreateMaterialInput,
  CreateWorkOrderInput,
  FactoryDashboardSummary,
  FactoryLocation,
  FactoryMaterialCategory,
  FinishedGood,
  FinishedGoodDetail,
  Machine,
  MaterialDetail,
  MaterialMovementInput,
  MaterialRequirement,
  MaterialSummary,
  MrpReportRow,
  ProductionLine,
  RecordLaborInput,
  RecordOutputInput,
  RecordQualityCheckInput,
  ScrapReport,
  ShipFinishedGoodInput,
  StageTemplate,
  UpdateWorkOrderInput,
  UpdateWorkOrderStageInput,
  WorkOrderDetail,
  WorkOrderListItem,
} from "./factoryTypes";

export function getFactoryDashboard(): Promise<FactoryDashboardSummary> {
  return apiFetch<FactoryDashboardSummary>("/api/factory/dashboard");
}

// --- materials ---------------------------------------------------------

export function listMaterialCategories(): Promise<FactoryMaterialCategory[]> {
  return apiFetch<FactoryMaterialCategory[]>("/api/factory/material-categories");
}

export function createMaterialCategory(name: string, code: string): Promise<FactoryMaterialCategory> {
  return apiFetch<FactoryMaterialCategory>("/api/factory/material-categories", { method: "POST", body: JSON.stringify({ name, code }) });
}

export function listFactoryLocations(): Promise<FactoryLocation[]> {
  return apiFetch<FactoryLocation[]>("/api/factory/locations");
}

export function createFactoryLocation(name: string, kind: string): Promise<FactoryLocation> {
  return apiFetch<FactoryLocation>("/api/factory/locations", { method: "POST", body: JSON.stringify({ name, kind }) });
}

export function listMaterials(): Promise<MaterialSummary[]> {
  return apiFetch<MaterialSummary[]>("/api/factory/materials");
}

export function getMaterial(materialId: string): Promise<MaterialDetail> {
  return apiFetch<MaterialDetail>(`/api/factory/materials/${encodeURIComponent(materialId)}`);
}

export function createMaterial(input: CreateMaterialInput): Promise<{ id: string; sku: string }> {
  return apiFetch<{ id: string; sku: string }>("/api/factory/materials", { method: "POST", body: JSON.stringify(input) });
}

export function updateMaterialCost(materialId: string, costPerUnit: number) {
  return apiFetch(`/api/factory/materials/${encodeURIComponent(materialId)}/cost`, {
    method: "PATCH",
    body: JSON.stringify({ costPerUnit }),
  });
}

export function recordMaterialMovement(materialId: string, input: MaterialMovementInput) {
  return apiFetch(`/api/factory/materials/${encodeURIComponent(materialId)}/movements`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- production: lines, machines, stage templates --------------------------

export function listProductionLines(): Promise<ProductionLine[]> {
  return apiFetch<ProductionLine[]>("/api/factory/production-lines");
}

export function createProductionLine(name: string, code: string, description?: string): Promise<ProductionLine> {
  return apiFetch<ProductionLine>("/api/factory/production-lines", { method: "POST", body: JSON.stringify({ name, code, description }) });
}

export function listMachines(): Promise<Machine[]> {
  return apiFetch<Machine[]>("/api/factory/machines");
}

export function createMachine(input: { name: string; code: string; lineId?: string; machineType?: string }): Promise<Machine> {
  return apiFetch<Machine>("/api/factory/machines", { method: "POST", body: JSON.stringify(input) });
}

export function updateMachineStatus(machineId: string, status: Machine["status"]) {
  return apiFetch(`/api/factory/machines/${encodeURIComponent(machineId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function listStageTemplates(): Promise<StageTemplate[]> {
  return apiFetch<StageTemplate[]>("/api/factory/stage-templates");
}

export function createStageTemplate(input: { name: string; defaultSequenceOrder: number; defaultLineId?: string }): Promise<StageTemplate> {
  return apiFetch<StageTemplate>("/api/factory/stage-templates", { method: "POST", body: JSON.stringify(input) });
}

// --- finished goods + BOM ---------------------------------------------------

export function listFinishedGoods(): Promise<FinishedGood[]> {
  return apiFetch<FinishedGood[]>("/api/factory/finished-goods");
}

export function createFinishedGood(input: CreateFinishedGoodInput): Promise<FinishedGood> {
  return apiFetch<FinishedGood>("/api/factory/finished-goods", { method: "POST", body: JSON.stringify(input) });
}

export function getFinishedGood(finishedGoodId: string): Promise<FinishedGoodDetail> {
  return apiFetch<FinishedGoodDetail>(`/api/factory/finished-goods/${encodeURIComponent(finishedGoodId)}`);
}

/** The module's one deliberate hook into the brand side — records stock leaving the factory tagged with a brand id, never touching that brand's own tables. See finishedGoods.schema.ts. */
export function shipFinishedGood(finishedGoodId: string, input: ShipFinishedGoodInput) {
  return apiFetch(`/api/factory/finished-goods/${encodeURIComponent(finishedGoodId)}/ship`, { method: "POST", body: JSON.stringify(input) });
}

export function listBoms(finishedGoodId?: string): Promise<BomListItem[]> {
  const query = finishedGoodId ? `?finishedGoodId=${encodeURIComponent(finishedGoodId)}` : "";
  return apiFetch<BomListItem[]>(`/api/factory/boms${query}`);
}

export function getBom(bomId: string): Promise<BomDetail> {
  return apiFetch<BomDetail>(`/api/factory/boms/${encodeURIComponent(bomId)}`);
}

export function createBom(input: CreateBomInput): Promise<{ id: string; version: number }> {
  return apiFetch<{ id: string; version: number }>("/api/factory/boms", { method: "POST", body: JSON.stringify(input) });
}

export function updateBomStatus(bomId: string, status: "draft" | "active" | "archived") {
  return apiFetch(`/api/factory/boms/${encodeURIComponent(bomId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function getMaterialRequirements(bomId: string, quantityOrdered: number): Promise<MaterialRequirement[]> {
  return apiFetch<MaterialRequirement[]>(
    `/api/factory/boms/${encodeURIComponent(bomId)}/material-requirements?quantityOrdered=${encodeURIComponent(quantityOrdered)}`,
  );
}

// --- work orders -------------------------------------------------------

export function listWorkOrders(status?: string): Promise<WorkOrderListItem[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<WorkOrderListItem[]>(`/api/factory/work-orders${query}`);
}

export function getWorkOrder(workOrderId: string): Promise<WorkOrderDetail> {
  return apiFetch<WorkOrderDetail>(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}`);
}

export function createWorkOrder(input: CreateWorkOrderInput): Promise<{ id: string; orderNumber: string }> {
  return apiFetch<{ id: string; orderNumber: string }>("/api/factory/work-orders", { method: "POST", body: JSON.stringify(input) });
}

export function updateWorkOrderStatus(workOrderId: string, status: string, reason?: string) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

/** Only accepted by the backend while the order is still draft/scheduled — see updateWorkOrder's guard in workOrders.service.ts. */
export function updateWorkOrder(workOrderId: string, input: UpdateWorkOrderInput) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function updateWorkOrderStage(workOrderId: string, stageId: string, input: UpdateWorkOrderStageInput) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/stages/${encodeURIComponent(stageId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function issueBomMaterials(workOrderId: string, fromLocationId: string, notes?: string) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/materials/issue`, {
    method: "POST",
    body: JSON.stringify({ fromLocationId, notes }),
  });
}

export function recordOutput(workOrderId: string, input: RecordOutputInput) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/output`, { method: "POST", body: JSON.stringify(input) });
}

export function recordLabor(workOrderId: string, input: RecordLaborInput) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/labor`, { method: "POST", body: JSON.stringify(input) });
}

export function recordQualityCheck(workOrderId: string, input: RecordQualityCheckInput) {
  return apiFetch(`/api/factory/work-orders/${encodeURIComponent(workOrderId)}/quality-checks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- reports (aggregate MRP, scrap/waste, costing) --------------------------

export function getMrpReport(): Promise<MrpReportRow[]> {
  return apiFetch<MrpReportRow[]>("/api/factory/reports/mrp");
}

export function getScrapReport(): Promise<ScrapReport> {
  return apiFetch<ScrapReport>("/api/factory/reports/scrap");
}

export function getCostingReport(): Promise<CostingReportRow[]> {
  return apiFetch<CostingReportRow[]>("/api/factory/reports/costing");
}
