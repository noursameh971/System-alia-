import { or, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reasonCodes } from "../../db/schema/index.js";

export async function listReasonCodes(appliesTo?: "stock_movement" | "return") {
  return db
    .select({ id: reasonCodes.id, code: reasonCodes.code, label: reasonCodes.label, appliesTo: reasonCodes.appliesTo })
    .from(reasonCodes)
    .where(appliesTo ? or(eq(reasonCodes.appliesTo, appliesTo), eq(reasonCodes.appliesTo, "both")) : undefined)
    .orderBy(reasonCodes.label);
}
