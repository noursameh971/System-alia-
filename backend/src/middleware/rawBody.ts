import express, { type RequestHandler } from "express";

/**
 * Captures the raw request body as a Buffer regardless of Content-Type —
 * used for file-upload routes (the body is the file's bytes, not JSON) so
 * the app-wide express.json() in app.ts keeps handling every other route.
 * Scoped per-route, not global. Shared by products/expenses/orders' .xlsx
 * import routes and the product/brand image upload routes.
 */
export function rawBody(limit: string): RequestHandler {
  return express.raw({ type: () => true, limit });
}
