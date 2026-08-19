import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listCategories, renameCategory } from "./categories.service.js";
import type { RenameCategoryInput } from "./categories.schema.js";

export async function getCategories(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listCategories());
}

/** PATCH /api/categories/:categoryId — the "Manage Categories" modal's rename action. */
export async function renameCategoryHandler(req: Request, res: Response): Promise<void> {
  const categoryId = String(req.params.categoryId ?? "");
  const { name } = req.body as RenameCategoryInput;

  const result = await renameCategory(categoryId, name);
  sendSuccess(res, 200, result);
}
