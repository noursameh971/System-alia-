import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import type { CreateMaterialInput, MaterialMovementInput, UpdateMaterialInput } from "./materials.schema.js";
import {
  createLocation,
  createMaterial,
  createMaterialCategory,
  getMaterialDetail,
  listLocations,
  listMaterialCategories,
  listMaterials,
  recordMaterialMovementForMaterial,
  updateMaterial,
  updateMaterialCost,
} from "./materials.service.js";

export async function getMaterialCategories(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listMaterialCategories());
}

export async function createMaterialCategoryHandler(req: Request, res: Response): Promise<void> {
  const { name, code } = req.body as { name: string; code: string };
  sendSuccess(res, 201, await createMaterialCategory(name, code));
}

export async function getLocations(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listLocations());
}

export async function createLocationHandler(req: Request, res: Response): Promise<void> {
  const { name, kind } = req.body as { name: string; kind: string };
  sendSuccess(res, 201, await createLocation(name, kind));
}

export async function getMaterials(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listMaterials());
}

export async function getMaterialDetailHandler(req: Request, res: Response): Promise<void> {
  const materialId = String(req.params.materialId ?? "");
  sendSuccess(res, 200, await getMaterialDetail(materialId));
}

export async function createMaterialHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateMaterialInput;
  sendSuccess(res, 201, await createMaterial(input, req.user!.id));
}

export async function updateMaterialHandler(req: Request, res: Response): Promise<void> {
  const materialId = String(req.params.materialId ?? "");
  const input = req.body as UpdateMaterialInput;
  sendSuccess(res, 200, await updateMaterial(materialId, input));
}

export async function updateMaterialCostHandler(req: Request, res: Response): Promise<void> {
  const materialId = String(req.params.materialId ?? "");
  const { costPerUnit } = req.body as { costPerUnit: number };
  sendSuccess(res, 200, await updateMaterialCost(materialId, costPerUnit, req.user!.id));
}

export async function recordMaterialMovementHandler(req: Request, res: Response): Promise<void> {
  const materialId = String(req.params.materialId ?? "");
  const input = req.body as MaterialMovementInput;
  await recordMaterialMovementForMaterial(materialId, input, req.user!.id);
  sendSuccess(res, 201, { recorded: true });
}
