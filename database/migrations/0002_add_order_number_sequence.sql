-- Step 6 addition: a plain monotonic sequence used to generate order
-- numbers at order-creation time (see backend/src/modules/orders/orders.service.ts),
-- the same pattern 0001 used for variant SKUs.
--
-- Does NOT alter any existing table — only adds a new sequence object.

CREATE SEQUENCE IF NOT EXISTS order_number_seq;
