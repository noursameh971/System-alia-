import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getSettings, resetTransactionalData, updateSettings } from "./settings.service.js";
import type { UpdateSettingsInput } from "./settings.schema.js";

/** GET /api/settings — the single global settings row (both roles can read; the app's rendering depends on it). */
export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getSettings());
}

/** PATCH /api/settings — the General & Localization tab's save action, admin only. */
export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as UpdateSettingsInput;
  sendSuccess(res, 200, await updateSettings(input));
}

/** POST /api/settings/reset-data — Danger Zone. Body shape ({confirmation: "RESET"}) already validated by validateBody. */
export async function resetDataHandler(_req: Request, res: Response): Promise<void> {
  await resetTransactionalData();
  sendSuccess(res, 200, { success: true });
}
