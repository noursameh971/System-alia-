import { sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { CATEGORY_LABELS, PAYMENT_LABELS } from "../expenses/expenses.io.service.js";
import type { ExpenseCategory, ExpensePaymentMethod } from "../expenses/expenses.schema.js";
import { embedDocuments } from "./embedder.js";
import { contentHash, deleteMissingRecords, existingRecordHashes, insertSingleChunkDocuments, writeDocument } from "./index.service.js";

/**
 * Mirrors the business's own rows into the knowledge index, one short text
 * per row, so search_knowledge can *find* things by meaning — "who supplies
 * our zippers?", "that payment to the printer in September" — across
 * suppliers, products, materials, money in and out, ledger entries,
 * receipts, orders and work orders.
 *
 * Deliberately left out: numbers that change all the time (stock on hand,
 * running balances). Those come live from the tools; an index copy would
 * be stale within the hour and re-embedded constantly.
 *
 * Sync is incremental: each row's text is hashed, and only rows whose text
 * changed are re-embedded. It runs at startup, every few minutes, before a
 * search when the index is older than that, and after a confirmed draft.
 */

export interface RecordDocument {
  sourceType: string;
  sourceId: string;
  brandId: string | null;
  ledgerEntityId?: string | null;
  title: string;
  text: string;
}

const REVENUE_LABELS: Record<string, string> = {
  product_sales: "Product Sales",
  wholesale: "Wholesale",
  shipping_income: "Shipping Income",
  other: "Other Income",
};

const money = (value: unknown) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP`;
const clip = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" ");

type Row = Record<string, unknown>;
async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

/** Every record type's builder. Each returns all of its current documents. */
const BUILDERS: Record<string, () => Promise<RecordDocument[]>> = {
  async ledger_entity() {
    const list = await rows(sql`
      select e.id, e.brand_id, e.name, e.category, e.balance_type, e.phone, e.notes, b.code as brand
      from ledger_entities e join brands b on b.id = e.brand_id`);
    return list.map((r) => ({
      sourceType: "ledger_entity",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      ledgerEntityId: r.id as string,
      title: `Ledger: ${r.name}`,
      text: join(
        `${r.balance_type === "payable" ? "Supplier/creditor (we owe them)" : "Client/debtor (they owe us)"} "${r.name}" in ${r.brand},`,
        `category ${r.category}.`,
        r.phone ? `Phone ${r.phone}.` : null,
        clip(r.notes, 300) ? `Notes: ${clip(r.notes, 300)}` : null,
      ),
    }));
  },

  async product() {
    const list = await rows(sql`
      select p.id, p.brand_id, p.name, p.status, p.description, c.name as category, b.code as brand,
        (select count(*) from product_variants v where v.product_id = p.id) as variants,
        (select string_agg(distinct av.value, ', ') from product_variants v
           join variant_attribute_values vav on vav.variant_id = v.id
           join attribute_values av on av.id = vav.attribute_value_id where v.product_id = p.id) as options,
        (select string_agg(sku, ', ') from (select v.sku from product_variants v where v.product_id = p.id order by v.sku limit 3) s) as skus,
        (select min(pr.price) from product_variants v join variant_prices pr on pr.variant_id = v.id and pr.effective_to is null where v.product_id = p.id) as min_price,
        (select max(pr.price) from product_variants v join variant_prices pr on pr.variant_id = v.id and pr.effective_to is null where v.product_id = p.id) as max_price
      from products p join categories c on c.id = p.category_id join brands b on b.id = p.brand_id`);
    return list.map((r) => ({
      sourceType: "product",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      title: `Product: ${r.name}`,
      text: join(
        `Product "${r.name}" (${r.category}, ${r.brand}, ${r.status}), ${r.variants} variants.`,
        r.options ? `Options: ${clip(r.options, 200)}.` : null,
        r.skus ? `SKUs like ${r.skus}.` : null,
        r.min_price !== null ? `Price ${r.min_price === r.max_price ? money(r.min_price) : `${money(r.min_price)}–${money(r.max_price)}`}.` : null,
        clip(r.description, 200),
      ),
    }));
  },

  async raw_material() {
    const list = await rows(sql`
      select m.id, m.name, m.sku, m.unit, m.reorder_level, m.is_active, c.name as category
      from raw_materials m left join factory_material_categories c on c.id = m.category_id`);
    return list.map((r) => ({
      sourceType: "raw_material",
      sourceId: r.id as string,
      brandId: null,
      title: `Material: ${r.name}`,
      text: join(
        `Factory raw material "${r.name}" (SKU ${r.sku}${r.category ? `, ${r.category}` : ""}), measured in ${r.unit},`,
        `reorder level ${Number(r.reorder_level)}${r.is_active ? "" : ", inactive"}.`,
      ),
    }));
  },

  async finished_good() {
    const list = await rows(sql`select f.id, f.name, f.sku, f.unit, f.brand_id, b.code as brand from finished_goods f left join brands b on b.id = f.brand_id`);
    return list.map((r) => ({
      sourceType: "finished_good",
      sourceId: r.id as string,
      brandId: (r.brand_id as string | null) ?? null,
      title: `Finished good: ${r.name}`,
      text: `Factory finished good "${r.name}" (SKU ${r.sku}, per ${r.unit})${r.brand ? ` made for ${r.brand}` : ""}.`,
    }));
  },

  async expense() {
    const list = await rows(sql`
      select x.id, x.brand_id, x.title, x.category, x.amount, x.payment_method, x.expense_date, x.notes, x.ledger_entity_id, e.name as supplier
      from expenses x left join ledger_entities e on e.id = x.ledger_entity_id`);
    return list.map((r) => ({
      sourceType: "expense",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      ledgerEntityId: (r.ledger_entity_id as string | null) ?? null,
      title: `Expense: ${r.title}`,
      text: join(
        `Expense on ${r.expense_date}: "${r.title}", ${money(r.amount)},`,
        `${CATEGORY_LABELS[r.category as ExpenseCategory] ?? r.category}, paid by ${PAYMENT_LABELS[r.payment_method as ExpensePaymentMethod] ?? r.payment_method}`,
        r.supplier ? `to supplier ${r.supplier}.` : ".",
        clip(r.notes, 250) ? `Notes: ${clip(r.notes, 250)}` : null,
      ),
    }));
  },

  async revenue() {
    const list = await rows(sql`select id, brand_id, source, category, amount, revenue_date, notes from revenues`);
    return list.map((r) => ({
      sourceType: "revenue",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      title: `Revenue: ${r.source}`,
      text: join(
        `Revenue on ${r.revenue_date} from "${r.source}", ${money(r.amount)}, ${REVENUE_LABELS[r.category as string] ?? r.category}.`,
        clip(r.notes, 250) ? `Notes: ${clip(r.notes, 250)}` : null,
      ),
    }));
  },

  async ledger_transaction() {
    // Payments that mirror an expense are already indexed as that expense.
    const list = await rows(sql`
      select t.id, t.brand_id, t.entity_id, t.kind, t.amount, t.transaction_date, t.due_date, t.notes, e.name
      from ledger_transactions t join ledger_entities e on e.id = t.entity_id
      where not exists (select 1 from expenses x where x.ledger_transaction_id = t.id)`);
    return list.map((r) => ({
      sourceType: "ledger_transaction",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      ledgerEntityId: r.entity_id as string,
      title: `Ledger ${String(r.kind).replace("_", " ")}: ${r.name}`,
      text: join(
        `Ledger ${String(r.kind).replace("_", " ")} for "${r.name}" on ${r.transaction_date}: ${money(r.amount)}`,
        r.due_date ? `due ${r.due_date}.` : ".",
        clip(r.notes, 250) ? `Notes: ${clip(r.notes, 250)}` : null,
      ),
    }));
  },

  async receipt() {
    const list = await rows(sql`
      select a.id, a.file_name, a.extraction, c.brand_id
      from ai_attachments a left join ai_conversations c on c.id = a.conversation_id
      where a.extraction_status = 'done' and a.extraction is not null`);
    return list.flatMap((r) => {
      const x = r.extraction as Record<string, unknown>;
      if (x.kind === "other") return [];
      const items = Array.isArray(x.items) ? (x.items as { description?: string }[]).map((item) => item.description).filter(Boolean).join(", ") : "";
      return [
        {
          sourceType: "receipt",
          sourceId: r.id as string,
          brandId: (r.brand_id as string | null) ?? null,
          title: `Receipt: ${x.counterparty ?? r.file_name ?? "attachment"}`,
          text: join(
            `Attached ${x.kind} ${x.counterparty ? `from/to "${x.counterparty}"` : ""}`,
            x.amount ? `for ${money(x.amount)}` : null,
            x.date ? `dated ${x.date}` : null,
            x.reference ? `(ref ${x.reference}).` : ".",
            x.summary ? `${clip(x.summary, 150)}.` : null,
            items ? `Items: ${items.slice(0, 200)}.` : null,
          ),
        },
      ];
    });
  },

  async order() {
    const list = await rows(sql`
      select o.id, o.brand_id, o.order_number, o.customer_name, o.status, o.order_date,
        (select string_agg(p.name || ' x' || i.quantity, ', ') from order_items i
           join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id where i.order_id = o.id) as items
      from orders o order by o.order_date desc limit 3000`);
    return list.map((r) => ({
      sourceType: "order",
      sourceId: r.id as string,
      brandId: r.brand_id as string,
      title: `Order ${r.order_number}`,
      text: join(
        `Order ${r.order_number} on ${new Date(r.order_date as string).toISOString().slice(0, 10)}`,
        r.customer_name ? `for customer ${r.customer_name},` : ",",
        `status ${r.status}.`,
        r.items ? `Items: ${clip(r.items, 250)}.` : null,
      ),
    }));
  },

  async work_order() {
    const list = await rows(sql`
      select w.id, w.order_number, w.status, w.priority, w.quantity_ordered, w.planned_start_date, w.planned_end_date, w.notes,
        f.name as product, f.brand_id
      from work_orders w join finished_goods f on f.id = w.finished_good_id`);
    return list.map((r) => ({
      sourceType: "work_order",
      sourceId: r.id as string,
      brandId: (r.brand_id as string | null) ?? null,
      title: `Work order ${r.order_number}`,
      text: join(
        `Factory work order ${r.order_number}: ${Number(r.quantity_ordered)} × "${r.product}", status ${r.status}, priority ${r.priority}`,
        r.planned_start_date ? `planned ${r.planned_start_date} to ${r.planned_end_date ?? "?"}.` : ".",
        clip(r.notes, 200) ? `Notes: ${clip(r.notes, 200)}` : null,
      ),
    }));
  },
};

export const RECORD_TYPES = Object.keys(BUILDERS);

/** A record's single chunk: its title leads, so the embedding and keyword search both see the name. */
function recordChunk(record: RecordDocument): string {
  return `${record.title} — ${record.text}`.replace(/\s+/g, " ").trim();
}

export interface SyncResult {
  indexed: number;
  removed: number;
  unchanged: number;
  ms: number;
}

let syncing: Promise<SyncResult> | null = null;
let lastSyncedAt = 0;
const STALE_AFTER_MS = 3 * 60_000;

/** Brings the mirrored records up to date. Concurrent calls share one run. */
export function syncRecords(): Promise<SyncResult> {
  syncing ??= (async () => {
    const started = Date.now();
    const records = (await Promise.all(RECORD_TYPES.map((type) => BUILDERS[type]!()))).flat();
    const existing = await existingRecordHashes(RECORD_TYPES);
    const changed = records.flatMap((record) => {
      const chunk = recordChunk(record);
      const current = existing.get(record.sourceId);
      return current && current.hash === contentHash(record.title, [chunk]) ? [] : [{ record, chunk, existingId: current?.id }];
    });
    // Embedded in batches of 64; new rows are inserted in bulk, edited ones
    // replaced one by one (edits are few after the first sync).
    for (let start = 0; start < changed.length; start += 64) {
      const batch = changed.slice(start, start + 64);
      const vectors = await embedDocuments(batch.map((item) => item.chunk));
      const fresh = batch.flatMap(({ record, chunk, existingId }, index) =>
        existingId ? [] : [{ sourceType: record.sourceType, sourceId: record.sourceId, brandId: record.brandId, ledgerEntityId: record.ledgerEntityId, title: record.title, chunk, vector: vectors[index]! }],
      );
      await insertSingleChunkDocuments(fresh);
      for (const [index, { record, chunk, existingId }] of batch.entries()) {
        if (!existingId) continue;
        await writeDocument(
          { sourceType: record.sourceType, sourceId: record.sourceId, brandId: record.brandId, ledgerEntityId: record.ledgerEntityId, title: record.title, chunks: [chunk] },
          existingId,
          [vectors[index]!],
        );
      }
    }
    const indexed = changed.length;
    const removed = await deleteMissingRecords(RECORD_TYPES, new Set(records.map((record) => record.sourceId)));
    lastSyncedAt = Date.now();
    return { indexed, removed, unchanged: records.length - indexed, ms: Date.now() - started };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Before a search: a sync only if the last one is more than a few minutes old. */
export async function ensureRecordsFresh(): Promise<void> {
  if (Date.now() - lastSyncedAt < STALE_AFTER_MS) return;
  try {
    await syncRecords();
  } catch (err) {
    // A failed sync shouldn't fail the search — it just searches what's indexed.
    console.error("Knowledge: record sync failed:", err instanceof Error ? err.message : err);
  }
}

/** Fire-and-forget refresh, e.g. right after a confirmed draft wrote a new row. */
export function scheduleRecordSync(): void {
  if (!env.KNOWLEDGE_ENABLED) return;
  lastSyncedAt = 0;
  setTimeout(() => void ensureRecordsFresh(), 1_000).unref();
}

/** Startup + periodic sync. Returns a stop function (used by tests). */
export function startRecordSync(intervalMs = STALE_AFTER_MS): () => void {
  if (!env.KNOWLEDGE_ENABLED) return () => {};
  const run = () =>
    void syncRecords()
      .then((result) => {
        if (result.indexed || result.removed) console.log(`Knowledge: synced records (${result.indexed} indexed, ${result.removed} removed) in ${result.ms}ms`);
      })
      .catch((err: unknown) => console.error("Knowledge: record sync failed:", err instanceof Error ? err.message : err));
  const first = setTimeout(run, 2_000);
  const timer = setInterval(run, intervalMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
