import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createBin,
  createWarehouse,
  createZone,
  listBins,
  listWarehouses,
  listZones,
} from "./warehouse.service.js";
import type { CreateBinInput, CreateWarehouseInput, CreateZoneInput } from "./warehouse.schema.js";

export async function getWarehouses(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listWarehouses());
}

export async function postWarehouse(req: Request, res: Response): Promise<void> {
  const warehouse = await createWarehouse(req.body as CreateWarehouseInput);
  sendSuccess(res, 201, warehouse);
}

export async function getZones(req: Request, res: Response): Promise<void> {
  const warehouseId = String(req.params.warehouseId ?? "");
  sendSuccess(res, 200, await listZones(warehouseId));
}

export async function postZone(req: Request, res: Response): Promise<void> {
  const warehouseId = String(req.params.warehouseId ?? "");
  const zone = await createZone(warehouseId, req.body as CreateZoneInput);
  sendSuccess(res, 201, zone);
}

export async function getBins(req: Request, res: Response): Promise<void> {
  const zoneId = String(req.params.zoneId ?? "");
  sendSuccess(res, 200, await listBins(zoneId));
}

export async function postBin(req: Request, res: Response): Promise<void> {
  const zoneId = String(req.params.zoneId ?? "");
  const bin = await createBin(zoneId, req.body as CreateBinInput);
  sendSuccess(res, 201, bin);
}
