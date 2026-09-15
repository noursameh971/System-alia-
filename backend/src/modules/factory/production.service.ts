import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { machines, productionLines, productionStageTemplates } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";

export function listProductionLines() {
  return db.select().from(productionLines).orderBy(productionLines.name);
}

export async function createProductionLine(name: string, code: string, description?: string) {
  const [existing] = await db.select({ id: productionLines.id }).from(productionLines).where(eq(productionLines.name, name)).limit(1);
  if (existing) throw ApiError.conflict(`A production line named "${name}" already exists`);
  const [created] = await db.insert(productionLines).values({ name, code, description }).returning();
  return created!;
}

export function listMachines() {
  return db
    .select({
      id: machines.id,
      name: machines.name,
      code: machines.code,
      machineType: machines.machineType,
      status: machines.status,
      lineId: machines.lineId,
      lineName: productionLines.name,
      purchaseDate: machines.purchaseDate,
      notes: machines.notes,
    })
    .from(machines)
    .leftJoin(productionLines, eq(productionLines.id, machines.lineId))
    .orderBy(machines.name);
}

export async function createMachine(input: { name: string; code: string; lineId?: string; machineType?: string; purchaseDate?: string; notes?: string }) {
  const [created] = await db.insert(machines).values(input).returning();
  return created!;
}

export async function updateMachineStatus(machineId: string, status: "idle" | "running" | "maintenance" | "down") {
  const [updated] = await db.update(machines).set({ status, updatedAt: sql`now()` }).where(eq(machines.id, machineId)).returning();
  if (!updated) throw ApiError.notFound(`Machine ${machineId} does not exist`);
  return updated;
}

export function listStageTemplates() {
  return db.select().from(productionStageTemplates).orderBy(productionStageTemplates.defaultSequenceOrder);
}

export async function createStageTemplate(input: { name: string; defaultSequenceOrder: number; defaultLineId?: string }) {
  const [existing] = await db.select({ id: productionStageTemplates.id }).from(productionStageTemplates).where(eq(productionStageTemplates.name, input.name)).limit(1);
  if (existing) throw ApiError.conflict(`A stage template named "${input.name}" already exists`);
  const [created] = await db.insert(productionStageTemplates).values(input).returning();
  return created!;
}
