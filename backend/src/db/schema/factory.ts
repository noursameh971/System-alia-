/**
 * Factory & Manufacturing ERP — standalone from the retail brands (Alia
 * Hijab / Noori). The module runs fully independently of the retail catalog;
 * the only bridges are `finishedGoods.linkedVariantId` (a nullable soft link
 * to a specific product variant) and `finishedGoods.brandId` (which retail
 * brand a finished product is manufactured for — required going forward so
 * the factory can organize production across multiple brands, but nullable
 * at the DB level so it stays optional, not a hard dependency).
 *
 * Two recurring shapes, both copied from patterns already proven elsewhere
 * in this schema:
 *  - Append-only history + "one active row" unique index, for anything
 *    price-like (see pricing.ts's variantCosts/variantPrices).
 *  - Running-balance table + append-only movement ledger, for anything
 *    stock-like (see inventory.ts + stockMovements.ts). MRP is deliberately
 *    NOT a stored table — it's `bom_lines × quantity_ordered` compared
 *    against `material_stock`, computed on demand in the service layer, the
 *    same "derive, don't duplicate" choice the dashboard's totals make.
 */
import { boolean, check, date, index, integer, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { productVariants } from "./catalog.js";
import {
  finishedGoodsMovementTypeEnum,
  machineStatusEnum,
  materialMovementTypeEnum,
  qualityResultEnum,
  stageStatusEnum,
  workOrderPriorityEnum,
  workOrderStatusEnum,
} from "./enums.js";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Master data: materials, locations, lines, machines, stage templates
// ---------------------------------------------------------------------------

export const factoryMaterialCategories = pgTable("factory_material_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Where physical stock sits — raw material stores, WIP floor, finished goods store. Deliberately its own table rather than reusing the retail `warehouses`: this module owns its own storage model end to end. */
export const factoryLocations = pgTable("factory_locations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  kind: varchar("kind", { length: 30 }).notNull().default("raw_material"), // raw_material | wip | finished_goods — informational only, not enforced
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawMaterials = pgTable(
  "raw_materials",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => factoryMaterialCategories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 60 }).notNull().unique(),
    // Free text (kg, gram, meter, cm, liter, piece, roll, yard, ...) rather
    // than an enum — units genuinely vary per material type and a new one
    // shouldn't need a migration. Validated against a suggested list at the
    // Zod layer instead.
    unit: varchar("unit", { length: 20 }).notNull(),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_raw_materials_category").on(table.categoryId)],
);

/** Append-only cost-per-unit history — same shape as variantCosts. Higher precision (4 dp) than retail pricing since a material's per-gram/per-cm cost is often a small fraction. */
export const materialCosts = pgTable(
  "material_costs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    materialId: uuid("material_id")
      .notNull()
      .references(() => rawMaterials.id, { onDelete: "cascade" }),
    costPerUnit: numeric("cost_per_unit", { precision: 14, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EGP"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_material_costs_active").on(table.materialId).where(sql`${table.effectiveTo} IS NULL`)],
);

/** Running on-hand balance per (material, location) — kept in sync by materialStockMovements, mirrors `inventory`. */
export const materialStock = pgTable(
  "material_stock",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    materialId: uuid("material_id")
      .notNull()
      .references(() => rawMaterials.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => factoryLocations.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uq_material_stock_material_location").on(table.materialId, table.locationId)],
);

/** Append-only movement log — the single source of truth material_stock is derived from, mirrors `stock_movements`. `unitCostSnapshot` on an `issue` row freezes material_costs.cost_per_unit at issuance time, same idea as order_items.cost_at_sale. */
export const materialStockMovements = pgTable(
  "material_stock_movements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    materialId: uuid("material_id")
      .notNull()
      .references(() => rawMaterials.id, { onDelete: "restrict" }),
    movementType: materialMovementTypeEnum("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    fromLocationId: uuid("from_location_id").references(() => factoryLocations.id, { onDelete: "restrict" }),
    toLocationId: uuid("to_location_id").references(() => factoryLocations.id, { onDelete: "restrict" }),
    unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 14, scale: 4 }),
    // e.g. reference_type='work_order', reference_id=work_orders.id — kept as
    // a loose (type, id) pair rather than an FK since a material movement can
    // reference different kinds of things (a work order, a manual receipt).
    referenceType: varchar("reference_type", { length: 30 }),
    referenceId: uuid("reference_id"),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_material_stock_movements_material").on(table.materialId, table.createdAt),
    index("ix_material_stock_movements_reference").on(table.referenceType, table.referenceId),
    check(
      "chk_material_movement_locations",
      sql`
        (${table.movementType} = 'receipt'    AND ${table.fromLocationId} IS NULL     AND ${table.toLocationId} IS NOT NULL) OR
        (${table.movementType} = 'issue'      AND ${table.fromLocationId} IS NOT NULL AND ${table.toLocationId} IS NULL) OR
        (${table.movementType} = 'return'     AND ${table.fromLocationId} IS NULL     AND ${table.toLocationId} IS NOT NULL) OR
        (${table.movementType} = 'waste'      AND ${table.fromLocationId} IS NOT NULL AND ${table.toLocationId} IS NULL) OR
        (${table.movementType} = 'adjustment')
      `,
    ),
  ],
);

export const productionLines = pgTable("production_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const machines = pgTable(
  "machines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    lineId: uuid("line_id").references(() => productionLines.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    machineType: varchar("machine_type", { length: 60 }),
    status: machineStatusEnum("status").notNull().default("idle"),
    purchaseDate: date("purchase_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_machines_line").on(table.lineId)],
);

/** Reusable stage definitions (Cutting, Sewing, Finishing, QC, Packing, ...) a BOM's routing is built from. */
export const productionStageTemplates = pgTable("production_stage_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  defaultSequenceOrder: integer("default_sequence_order").notNull().default(0),
  defaultLineId: uuid("default_line_id").references(() => productionLines.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Finished goods + BOM
// ---------------------------------------------------------------------------

export const finishedGoods = pgTable(
  "finished_goods",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 60 }).notNull().unique(),
    unit: varchar("unit", { length: 20 }).notNull().default("piece"),
    // Which retail brand this finished product is manufactured for — nullable
    // at the DB level (existing rows predate this column, and the module
    // must keep working with it unset), but the create form requires picking
    // one going forward so factory output can be organized per brand.
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    // Optional, one-directional bridge to the retail catalog — NOT a
    // dependency: this table (and everything else in this file) works fully
    // standalone with this left null.
    linkedVariantId: uuid("linked_variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_finished_goods_linked_variant").on(table.linkedVariantId),
    index("ix_finished_goods_brand").on(table.brandId),
  ],
);

export const boms = pgTable(
  "boms",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    finishedGoodId: uuid("finished_good_id")
      .notNull()
      .references(() => finishedGoods.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    label: varchar("label", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | active | archived
    // A BOM's lines are quantities to produce this many finished units in one batch (e.g. 1 dozen) — scales linearly with a work order's quantity_ordered.
    outputQuantity: numeric("output_quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uq_boms_finished_good_version").on(table.finishedGoodId, table.version)],
);

export const bomLines = pgTable(
  "bom_lines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => boms.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => rawMaterials.id, { onDelete: "restrict" }),
    quantityPerBatch: numeric("quantity_per_batch", { precision: 14, scale: 4 }).notNull(),
    wasteAllowancePct: numeric("waste_allowance_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    sequenceOrder: integer("sequence_order").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [index("ix_bom_lines_bom").on(table.bomId)],
);

export const bomStages = pgTable(
  "bom_stages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => boms.id, { onDelete: "cascade" }),
    stageTemplateId: uuid("stage_template_id")
      .notNull()
      .references(() => productionStageTemplates.id, { onDelete: "restrict" }),
    sequenceOrder: integer("sequence_order").notNull(),
    standardTimeMinutes: numeric("standard_time_minutes", { precision: 8, scale: 2 }),
    defaultLineId: uuid("default_line_id").references(() => productionLines.id, { onDelete: "set null" }),
  },
  (table) => [unique("uq_bom_stages_bom_sequence").on(table.bomId, table.sequenceOrder)],
);

// ---------------------------------------------------------------------------
// Work orders (production orders) + execution tracking
// ---------------------------------------------------------------------------

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
    finishedGoodId: uuid("finished_good_id")
      .notNull()
      .references(() => finishedGoods.id, { onDelete: "restrict" }),
    // Snapshot of which BOM version this order was planned against — a later
    // BOM edit must never silently change an in-flight order's requirements.
    bomId: uuid("bom_id")
      .notNull()
      .references(() => boms.id, { onDelete: "restrict" }),
    quantityOrdered: numeric("quantity_ordered", { precision: 14, scale: 3 }).notNull(),
    // Running totals, kept in sync by the service layer from
    // production_output_logs — same "denormalized total, single writer"
    // tradeoff `inventory.quantity` already makes.
    quantityCompleted: numeric("quantity_completed", { precision: 14, scale: 3 }).notNull().default("0"),
    quantityScrapped: numeric("quantity_scrapped", { precision: 14, scale: 3 }).notNull().default("0"),
    status: workOrderStatusEnum("status").notNull().default("draft"),
    priority: workOrderPriorityEnum("priority").notNull().default("normal"),
    lineId: uuid("line_id").references(() => productionLines.id, { onDelete: "set null" }),
    plannedStartDate: date("planned_start_date"),
    plannedEndDate: date("planned_end_date"),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_work_orders_status").on(table.status),
    index("ix_work_orders_finished_good").on(table.finishedGoodId),
  ],
);

/** Instantiated from bom_stages when a work order is created — this order's own copy of the routing, so per-stage progress can be tracked without mutating the BOM template. */
export const workOrderStages = pgTable(
  "work_order_stages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    stageTemplateId: uuid("stage_template_id")
      .notNull()
      .references(() => productionStageTemplates.id, { onDelete: "restrict" }),
    sequenceOrder: integer("sequence_order").notNull(),
    lineId: uuid("line_id").references(() => productionLines.id, { onDelete: "set null" }),
    machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
    status: stageStatusEnum("status").notNull().default("pending"),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (table) => [
    unique("uq_work_order_stages_order_sequence").on(table.workOrderId, table.sequenceOrder),
    index("ix_work_order_stages_order").on(table.workOrderId),
  ],
);

/** Simple text worker identity for v1 — no dedicated employee/HR table in scope yet; `workerName` is free text rather than a FK so labor can be logged without first provisioning a worker record. */
export const laborLogs = pgTable(
  "labor_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => workOrderStages.id, { onDelete: "set null" }),
    workerName: varchar("worker_name", { length: 150 }).notNull(),
    hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }).notNull(),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
    quantityProduced: numeric("quantity_produced", { precision: 14, scale: 3 }).notNull().default("0"),
    logDate: date("log_date").notNull().defaultNow(),
    notes: text("notes"),
    loggedBy: uuid("logged_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_labor_logs_work_order").on(table.workOrderId)],
);

/** Per-stage/per-day output entries — good + scrap quantities. work_orders.quantity_completed/quantity_scrapped are the running sum of this table, kept in sync in the service layer. */
export const productionOutputLogs = pgTable(
  "production_output_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => workOrderStages.id, { onDelete: "set null" }),
    quantityGood: numeric("quantity_good", { precision: 14, scale: 3 }).notNull().default("0"),
    quantityScrap: numeric("quantity_scrap", { precision: 14, scale: 3 }).notNull().default("0"),
    scrapReason: varchar("scrap_reason", { length: 200 }),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (table) => [index("ix_production_output_logs_work_order").on(table.workOrderId)],
);

export const qualityChecks = pgTable(
  "quality_checks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => workOrderStages.id, { onDelete: "set null" }),
    checkedQuantity: numeric("checked_quantity", { precision: 14, scale: 3 }).notNull(),
    passedQuantity: numeric("passed_quantity", { precision: 14, scale: 3 }).notNull(),
    failedQuantity: numeric("failed_quantity", { precision: 14, scale: 3 }).notNull(),
    result: qualityResultEnum("result").notNull(),
    inspectorNotes: text("inspector_notes"),
    checkedBy: uuid("checked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_quality_checks_work_order").on(table.workOrderId)],
);

// ---------------------------------------------------------------------------
// Finished goods inventory — same running-balance + ledger pair as materials
// ---------------------------------------------------------------------------

export const finishedGoodsStock = pgTable(
  "finished_goods_stock",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    finishedGoodId: uuid("finished_good_id")
      .notNull()
      .references(() => finishedGoods.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => factoryLocations.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uq_finished_goods_stock_good_location").on(table.finishedGoodId, table.locationId)],
);

export const finishedGoodsMovements = pgTable(
  "finished_goods_movements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    finishedGoodId: uuid("finished_good_id")
      .notNull()
      .references(() => finishedGoods.id, { onDelete: "restrict" }),
    movementType: finishedGoodsMovementTypeEnum("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    fromLocationId: uuid("from_location_id").references(() => factoryLocations.id, { onDelete: "restrict" }),
    toLocationId: uuid("to_location_id").references(() => factoryLocations.id, { onDelete: "restrict" }),
    referenceType: varchar("reference_type", { length: 30 }),
    referenceId: uuid("reference_id"),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_finished_goods_movements_good").on(table.finishedGoodId, table.createdAt)],
);
