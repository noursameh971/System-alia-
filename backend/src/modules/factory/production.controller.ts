import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createMachine,
  createProductionLine,
  createStageTemplate,
  listMachines,
  listProductionLines,
  listStageTemplates,
  updateMachineStatus,
} from "./production.service.js";

export async function getProductionLines(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listProductionLines());
}

export async function createProductionLineHandler(req: Request, res: Response): Promise<void> {
  const { name, code, description } = req.body as { name: string; code: string; description?: string };
  sendSuccess(res, 201, await createProductionLine(name, code, description));
}

export async function getMachines(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listMachines());
}

export async function createMachineHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 201, await createMachine(req.body));
}

export async function updateMachineStatusHandler(req: Request, res: Response): Promise<void> {
  const machineId = String(req.params.machineId ?? "");
  const { status } = req.body as { status: "idle" | "running" | "maintenance" | "down" };
  sendSuccess(res, 200, await updateMachineStatus(machineId, status));
}

export async function getStageTemplates(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listStageTemplates());
}

export async function createStageTemplateHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 201, await createStageTemplate(req.body));
}
