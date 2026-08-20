import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { brandsRouter } from "./modules/brands/brands.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { ledgerRouter } from "./modules/ledger/ledger.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { reasonCodesRouter } from "./modules/reason-codes/reasonCodes.routes.js";
import { returnsRouter } from "./modules/returns/returns.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { stockMovementsRouter } from "./modules/stock-movements/stockMovements.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { warehouseRouter } from "./modules/warehouse/warehouse.routes.js";

// Strips a trailing slash and any surrounding quotes — an Origin header
// never has either, but a value pasted into a host's env var UI
// (e.g. Railway) sometimes keeps literal quote characters, which would
// otherwise silently make every origin fail to match.
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}

export function createApp(): Express {
  const app = express();

  const allowedOrigins = [
    ...env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    ...(env.FRONTEND_URL ? [env.FRONTEND_URL] : []),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  console.log(`CORS: allowing origins: ${allowedOrigins.join(", ") || "(none configured)"}`);

  // crossOriginResourcePolicy relaxed to "cross-origin": the default
  // "same-origin" would block the frontend (a different origin/port) from
  // loading product images via plain <img src> — CORP is enforced by the
  // browser for any cross-origin resource load, not just fetch/XHR, so the
  // `cors` middleware below (which only governs fetch/XHR) can't fix this
  // on its own.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      // A function (rather than a static array) lets a rejected request log
      // exactly which Origin header it sent and what was allowed — visible
      // in Railway's logs — instead of leaving "no Access-Control-Allow-Origin
      // header" as the only clue in the browser console.
      origin(requestOrigin, callback) {
        if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
          callback(null, true);
          return;
        }
        console.warn(`CORS: rejected origin "${requestOrigin}" — allowed: ${allowedOrigins.join(", ")}`);
        callback(new Error(`Origin ${requestOrigin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  // Uploaded product images (see products.image.service.ts) — no cloud
  // storage in this environment, so they're written to local disk and
  // served straight from there.
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/brands", brandsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/warehouses", warehouseRouter);
  app.use("/api/stock-movements", stockMovementsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/reason-codes", reasonCodesRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/returns", returnsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/ledger", ledgerRouter);

  // Must be registered last — Express only routes here on thrown/forwarded errors.
  app.use(errorHandler);

  return app;
}
