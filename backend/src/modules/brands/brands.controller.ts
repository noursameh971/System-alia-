import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createBrand, getBrandProfile, listBrands, updateBrandProfile } from "./brands.service.js";
import { uploadBrandLogo } from "./brands.image.service.js";
import type { CreateBrandInput, UpdateBrandProfileInput } from "./brands.schema.js";

export async function getBrands(req: Request, res: Response): Promise<void> {
  const brandId = req.user?.role === "admin" ? null : req.user?.brandId;
  sendSuccess(res, 200, await listBrands(brandId));
}

/** POST /api/brands — the "+ New Workspace" modal. */
export async function createBrandHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateBrandInput;
  sendSuccess(res, 201, await createBrand(input));
}

/** GET /api/brands/:brandId/profile — the Settings page's "Brand Profile" tab. */
export async function getBrandProfileHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.params.brandId ?? "");
  sendSuccess(res, 200, await getBrandProfile(brandId));
}

/** PATCH /api/brands/:brandId/profile — the Brand Profile tab's save action (name, receipt notes). */
export async function updateBrandProfileHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.params.brandId ?? "");
  const input = req.body as UpdateBrandProfileInput;
  sendSuccess(res, 200, await updateBrandProfile(brandId, input));
}

/** POST /api/brands/:brandId/logo — the Brand Profile tab's logo upload; body is the raw image bytes. */
export async function uploadBrandLogoHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.params.brandId ?? "");
  if (!Buffer.isBuffer(req.body)) throw ApiError.badRequest("Request body must be the raw image bytes");
  const contentType = req.headers["content-type"] ?? "";

  sendSuccess(res, 200, await uploadBrandLogo(brandId, req.body, contentType));
}
