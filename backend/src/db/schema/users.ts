import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userRoleEnum } from "./enums.js";
import { brands } from "./brands.js";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("warehouse_staff"),
  // Assigned workspace for warehouse_staff — NULL for admins, who aren't
  // scoped to a single brand. Enforced at the app layer (see auth.service.ts:
  // login rejects a staff account with no brand assigned) rather than a DB
  // CHECK, since Drizzle/Postgres can't easily express "NULL iff role=admin".
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
