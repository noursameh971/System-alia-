import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  deleteShippingRate,
  getSettings,
  listShippingRates,
  updateSettings,
  upsertShippingRate,
} from "./settings.service.js";
import {
  listShippingRatesQuerySchema,
  type UpdateSettingsInput,
  type UpsertShippingRateInput,
} from "./settings.schema.js";

/** GET /api/settings — the single global settings row (both roles can read; the app's rendering depends on it). */
export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getSettings());
}

/** PATCH /api/settings — the General & Localization + Inventory & Operations tabs' save actions, admin only. */
export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as UpdateSettingsInput;
  sendSuccess(res, 200, await updateSettings(input));
}

export async function getShippingRatesHandler(req: Request, res: Response): Promise<void> {
  const parsed = listShippingRatesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await listShippingRates(parsed.data.brandId));
}

export async function upsertShippingRateHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as UpsertShippingRateInput;
  sendSuccess(res, 200, await upsertShippingRate(input));
}

export async function deleteShippingRateHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await deleteShippingRate(id);
  sendSuccess(res, 200, { deleted: true });
}
