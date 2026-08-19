import test from "node:test";
import assert from "node:assert/strict";
import { buildImportPayload } from "./importAliaWorkbook.js";

test("buildImportPayload normalizes Arabic workbook rows into import-ready product data", () => {
  const payload = buildImportPayload({
    product: "شال أزرق",
    color: "أزرق",
    size: "مقاس كبير",
    price: "150.50",
  });

  assert.equal(payload.name, "شال أزرق - أزرق - مقاس كبير");
  assert.equal(payload.sku, "ALIA-001");
  assert.equal(payload.description, "اللون: أزرق | المقاس: مقاس كبير");
  assert.equal(payload.price, 150.5);
});
