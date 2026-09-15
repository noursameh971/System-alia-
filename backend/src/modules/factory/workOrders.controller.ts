import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createWorkOrder,
  getWorkOrderDetail,
  issueBomMaterials,
  listWorkOrders,
  recordLabor,
  recordOutput,
  recordQualityCheck,
  updateWorkOrder,
  updateWorkOrderStage,
  updateWorkOrderStatus,
} from "./workOrders.service.js";
import type {
  CreateWorkOrderInput,
  IssueBomMaterialsInput,
  RecordLaborInput,
  RecordOutputInput,
  RecordQualityCheckInput,
  UpdateWorkOrderInput,
  UpdateWorkOrderStageInput,
} from "./workOrders.schema.js";

export async function getWorkOrders(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  sendSuccess(res, 200, await listWorkOrders(status));
}

export async function getWorkOrderDetailHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 200, await getWorkOrderDetail(workOrderId));
}

export async function createWorkOrderHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 201, await createWorkOrder(req.body as CreateWorkOrderInput, req.user!.id));
}

export async function updateWorkOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  const { status, reason } = req.body as { status: string; reason?: string };
  sendSuccess(res, 200, await updateWorkOrderStatus(workOrderId, status, req.user!.id, reason));
}

export async function updateWorkOrderHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 200, await updateWorkOrder(workOrderId, req.body as UpdateWorkOrderInput));
}

export async function updateWorkOrderStageHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  const stageId = String(req.params.stageId ?? "");
  sendSuccess(res, 200, await updateWorkOrderStage(workOrderId, stageId, req.body as UpdateWorkOrderStageInput));
}

export async function issueBomMaterialsHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 201, await issueBomMaterials(workOrderId, req.body as IssueBomMaterialsInput, req.user!.id));
}

export async function recordOutputHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 201, await recordOutput(workOrderId, req.body as RecordOutputInput, req.user!.id));
}

export async function recordLaborHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 201, await recordLabor(workOrderId, req.body as RecordLaborInput, req.user!.id));
}

export async function recordQualityCheckHandler(req: Request, res: Response): Promise<void> {
  const workOrderId = String(req.params.workOrderId ?? "");
  sendSuccess(res, 201, await recordQualityCheck(workOrderId, req.body as RecordQualityCheckInput, req.user!.id));
}
