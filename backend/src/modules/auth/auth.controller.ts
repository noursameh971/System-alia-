import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { login } from "./auth.service.js";
import type { LoginInput } from "./auth.schema.js";

/** POST /api/auth/login — issues a JWT. The frontend stores it and mints its own session cookie (see docs/AUTH.md). */
export async function postLogin(req: Request, res: Response): Promise<void> {
  const result = await login(req.body as LoginInput);
  sendSuccess(res, 200, result);
}
