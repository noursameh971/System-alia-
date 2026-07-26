# Frontend — Multi-Brand Inventory & Order Management System

Next.js (App Router) + TypeScript + Tailwind CSS. Talks to the backend API
(`../backend`) over HTTP.

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL if the backend isn't on :4000

npm run dev   # http://localhost:3000
```

The backend must be running (see `../backend/README.md`) with
`AUTH_BYPASS=true` for now — there's no login flow yet, so every API call
goes out with no Authorization header. `src/lib/auth.ts` is the one place
that will change once the real auth module exists.

Other scripts: `npm run build`, `npm run lint`, `npm start` (serve a
production build).

## Folder structure

```
frontend/
  src/
    app/
      layout.tsx          # root layout — wraps everything in BrandProvider + DashboardShell
      page.tsx              # redirects "/" -> "/products"
      products/page.tsx      # Products page
      inventory/page.tsx      # Inventory page: Stock Levels / Record Movement tabs
      orders/page.tsx          # Order History dashboard
      orders/new/page.tsx        # manual order entry form
      orders/[id]/page.tsx         # order detail + Process Return
    components/
      layout/
        DashboardShell.tsx      # Header + Sidebar + MobileBottomNav + content slot
        Header.tsx                # top bar: logo + BrandToggle
        BrandToggle.tsx            # brand switcher (All / Alia Hijab / Noori), persisted
        Sidebar.tsx                  # desktop/tablet-landscape nav (hidden below md)
        MobileBottomNav.tsx           # phone/tablet-portrait bottom tab bar (hidden md+)
        navigation.ts                  # shared nav item list + active-route check
        icons.tsx                       # small inline SVG icons, no icon library dependency
      products/
        ProductList.tsx    # SWR fetch + brand filter -> ProductCard grid
        ProductCard.tsx      # one product: name, brand/category badges, variant list
        VariantRow.tsx         # one variant: SKU, attribute badges, price, Generate QR button
        QrCodeModal.tsx           # fetches the QR PNG, shows it, Download/Print
      inventory/
        StockFilters.tsx, StockLevelsTable.tsx   # the dashboard: category/zone/bin filters + results
        VariantScanInput.tsx                       # shared "scan or type SKU" -> resolved variant card
        BinSelect.tsx, QuantityInput.tsx              # shared form fields (forwardRef, for autofocus chaining)
        MovementStatusBanner.tsx                        # shared success/error banner
        InboundForm.tsx, OutboundForm.tsx, TransferForm.tsx   # one form per movement type
        MovementForms.tsx                                       # tab switcher between the three
      orders/
        OrderList.tsx           # dashboard: status filter + brand (global toggle) -> order rows
        OrderStatusBadge.tsx      # status -> Badge color/label map
        CreateOrderForm.tsx         # manual order entry: brand/customer fields + repeatable items
        OrderItemRow.tsx               # one order line: reuses VariantScanInput/BinSelect/QuantityInput
        OrderDetail.tsx                   # order header + items + return history, "Process Return" per item
        ReturnModal.tsx                      # quantity/reason/disposition(+bin)/notes -> POST /api/returns
      ui/
        Badge.tsx, Spinner.tsx, EmptyState.tsx, ComingSoon.tsx
    context/
      BrandContext.tsx    # brand list (SWR) + selected brand (persisted, cross-tab synced)
    hooks/
      useAllBins.ts          # every bin across the warehouse, flattened with zone code
      useVariantStock.ts       # per-bin on-hand quantity for one variant
    lib/
      apiClient.ts          # fetch wrapper: unwraps the backend's {success,data} envelope
      auth.ts                 # placeholder for attaching a JWT once login exists
      env.ts                    # NEXT_PUBLIC_API_URL
      types.ts                    # TS types mirroring backend response shapes
      brands.ts, categories.ts, products.ts, variants.ts, warehouses.ts, inventory.ts,
      reasonCodes.ts, orders.ts, returns.ts                                             # typed API functions per domain
```

## Layout & responsiveness

`DashboardShell` renders a left sidebar on `md:` and wider screens, and
switches to a fixed bottom tab bar below that — a bottom bar is more
thumb-reachable than a hamburger drawer for staff holding a phone or tablet
while walking the warehouse floor. Both navs share one `NAV_ITEMS` list
(`components/layout/navigation.ts`) so adding a page only means updating one
array plus its icon.

## Brand toggle

`GET /api/brands` (added this step) backs the toggle — brand names aren't
hardcoded in the frontend, since Step 1's whole point of a `brand_id`
foreign key was to let a 3rd/4th brand exist without a redeploy. Selection
persists to `localStorage` and syncs across browser tabs via
`useSyncExternalStore` (not a `useEffect` + `setState` on mount, which both
risks an SSR/hydration mismatch and trips the `react-hooks/set-state-in-effect`
lint rule that ships with this Next.js version).

## QR code integration

`VariantRow` renders a **Generate QR** button per variant. It opens
`QrCodeModal`, which calls the backend's existing
`GET /api/products/variants/:sku/qr-code` (the PNG endpoint built in Step 2,
generated by `qrcode.util.ts`) via an authenticated `fetch`, turns the
response into a blob object URL, and displays it as an `<img>`. A plain
`<img src="...">` can't send an Authorization header, which is why this
goes through `fetch` + `URL.createObjectURL` instead of pointing the `src`
straight at the API. The modal also offers **Download** (the object URL
with a `download` attribute) and **Print** (`window.print()`, scoped to
just the QR by a `#qr-print-area` visibility rule in `globals.css` so the
rest of the dashboard doesn't print too).

## Inventory page

Two tabs, both under the one `Inventory` nav item (no extra top-level route —
the mobile bottom nav only has three slots):

- **Record Movement** (the default landing tab — for staff actively working
  the floor, recording a movement is the far more frequent action than
  browsing a dashboard, so it gets the zero-tap spot). A sub-tab switch
  between Inbound / Outbound / Transfer, each a linear flow: scan-or-type a
  SKU → pick a bin (or From/To bins for transfer) → enter a quantity →
  submit. Fields autofocus as each becomes available (SKU input → bin select
  → quantity) via refs, so a fast worker never has to reach for the mouse.
  Outbound and Transfer's bin pickers only list bins where the scanned
  variant actually has stock, annotated with the live quantity (`A / A1 — 20
  in stock`) — pulled from the existing `GET /api/inventory/variants/:id`
  endpoint (Step 3) via `useVariantStock`. On success the form resets itself
  and refocuses the SKU input for the next scan; a 409 (insufficient stock)
  from the backend is translated into `Only 20 available in that bin (you
  asked for 9999)` instead of a raw error.
- **Stock Levels**: the dashboard. Filters by Category, Zone, and Bin
  (Brand reuses the header's existing global toggle rather than a second,
  redundant brand control) against the new `GET /api/inventory` endpoint.

### QR/SKU entry

`VariantScanInput` is the shared "scan or type SKU" component used by all
three movement forms. Per the ask, this step implements manual entry
(type or paste the code) rather than live camera scanning — camera-based
scanning would need the device camera plus a JS QR decode library (e.g.
`BarcodeDetector` or `@zxing/browser`), which is a reasonable future
addition but out of scope here. It resolves the SKU against the new `GET
/api/products/variants/by-sku/:sku` and shows the matched product/variant
(name, brand, attributes) before any bin/quantity step, so staff confirm
what they scanned instead of acting on a bare string. A 404 renders as `No
variant with SKU ...` inline.

## Orders & Returns (Step 6)

`/orders` has three views: a **history dashboard** (list, filterable by
status and — via the header's global toggle — brand), a **New Order** form,
and a **detail page** per order with return processing.

- `CreateOrderForm` reuses `VariantScanInput`, `BinSelect`, and
  `QuantityInput` from the Inventory module rather than rebuilding
  scan-and-pick — an order line item is the same shape as an outbound
  movement line, just accumulated into a list instead of submitted one at a
  time. Each row is its own `OrderItemRow` component (not inlined in the
  parent) specifically so each can call `useVariantStock` independently —
  React's rules of hooks don't allow a variable number of hook calls in one
  component for a dynamic-length item array. Since `VariantLookupResult`
  already carries the variant's active price, the line total and running
  order total update live as items are scanned, with no extra request.
  Submitting redirects to the new order's detail page.
- `OrderDetail` shows each line item's ordered/returned/returnable quantity
  and a **Process Return** button (disabled once nothing's returnable),
  plus a return history list. Both come from a single `GET /api/orders/:id`
  plus `GET /api/returns?orderId=` — the backend computes returnable
  quantity server-side so the frontend never has to reconcile it itself.
- `ReturnModal` caps the quantity input at what's actually returnable,
  fetches reason codes scoped to `?appliesTo=return`, and only shows the
  restock-bin picker when the Restock toggle is selected (a write-off has no
  bin). On success it calls back into `OrderDetail`, which `mutate()`s both
  the order and the returns list so the returned/returnable counts and
  history update immediately without a page reload.

## Backend additions needed for this step

Before Step 6, none of these existed:

- `POST /api/orders` / `GET /api/orders` / `GET /api/orders/:id` — full
  order lifecycle. Creating an order decrements inventory for every item in
  the *same* database transaction as creating the order itself (see the
  backend README's "Orders & Returns: composing one transaction, not two"
  for how the Step 3 movement functions were refactored to make this safe).
- `POST /api/returns` / `GET /api/returns` — processes a return against an
  order item, always requiring a reason code, and only incrementing
  inventory when `disposition: "restock"`.
- `GET /api/reason-codes` — backs the return reason dropdown.
- `GET /api/products/variants/by-sku/:sku` — resolves the scan/manual-entry
  input to a full variant record (added Step 5).
- `GET /api/inventory?brandId=&categoryId=&zoneId=&binId=` — lists current
  stock across every variant/bin for the dashboard (added Step 5).
- `GET /api/categories` — backs the Stock Levels category filter (added
  Step 5).

## Bugs Step 5's own testing caught

`VariantScanInput` originally rendered its own `<form onSubmit>` for
Enter-to-submit. Nested inside `InboundForm`/`OutboundForm`/`TransferForm`'s
own `<form>`, that's invalid HTML (`<form>` can't contain a `<form>`) and
broke React hydration — only visible once the page was actually loaded in a
browser, not from `npm run build`/`lint` alone. Fixed by dropping the inner
element to a `<div>` and handling Enter via `onKeyDown` with
`stopPropagation` so it can't also bubble into the outer form's submit.

Separately, `OutboundForm`/`TransferForm` weren't invalidating the cached
per-bin stock (`useVariantStock`'s SWR cache) after a successful movement,
so quickly re-scanning the same SKU right after submitting could briefly
show the pre-movement quantity in the bin picker. Both forms now call the
hook's `mutate` before resetting.

## Verification

Ran for real end-to-end against a live backend + Postgres for every step,
not just built:

- **Step 4**: headless Chromium via Playwright, screenshots at desktop and
  390×844 mobile, confirmed the Products page, brand-filtered empty state,
  and QR modal.
- **Step 5**: seeded a variant with 25 units in bin A1, then through the
  actual UI — Inbound(10→A2), a bad-SKU inline error, Outbound(5 from A1),
  a rejected oversized Outbound with the precise "Only 20 available"
  message, Transfer(3, A2→A1), then confirmed Stock Levels showed the exact
  expected final quantities (A1=23, A2=7).
- **Step 6**: seeded a variant with 30 units in bin A1. Through
  `/orders/new`: scanned the SKU, picked the bin, entered quantity 4,
  submitted — redirected to the new order's detail page showing the
  auto-generated order number (`ALH-ORD-000001`), correct line total, and
  `Pending` status. Confirmed Inventory → Stock Levels showed 26 (30 − 4).
  Back on the order, clicked **Process Return**, returned 2 units as
  `Restock` into bin A1 — confirmed the item row immediately showed "2
  returned" and a Return History entry appeared with zero page reload
  (SWR `mutate`). Confirmed Inventory showed 28 (26 + 2) — the full chain
  from form submit through the backend's composed transaction back to the
  dashboard query agrees exactly. Zero browser console errors across the
  whole run. `npm run build` and `npm run lint` pass clean.
