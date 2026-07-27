import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { brandsRouter } from "./modules/brands/brands.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { reasonCodesRouter } from "./modules/reason-codes/reasonCodes.routes.js";
import { returnsRouter } from "./modules/returns/returns.routes.js";
import { stockMovementsRouter } from "./modules/stock-movements/stockMovements.routes.js";
import { warehouseRouter } from "./modules/warehouse/warehouse.routes.js";

export function createApp(): Express {
  const app = express();

  if (env.AUTH_BYPASS) {
    console.warn(
      "\n⚠️  AUTH_BYPASS is enabled — every request is treated as an authenticated user with " +
        "NO token check. This is for local Postman testing only. Never set this in production " +
        "(env.ts already refuses to boot with AUTH_BYPASS=true + NODE_ENV=production, but double-check).\n",
    );
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

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

  // Must be registered last — Express only routes here on thrown/forwarded errors.
  app.use(errorHandler);

  return app;
}
