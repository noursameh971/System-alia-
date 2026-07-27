import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createUser, listUsers } from "./users.service.js";
import type { CreateUserInput } from "./users.schema.js";

/** GET /api/users — admin-only staff directory. */
export async function getUsers(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listUsers());
}

/** POST /api/users — admin-only. Creates an admin (no brand) or warehouse_staff (brand required) account. */
export async function postUser(req: Request, res: Response): Promise<void> {
  const user = await createUser(req.body as CreateUserInput);
  sendSuccess(res, 201, user);
}
