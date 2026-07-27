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
      layout.tsx              # root layout — fonts/globals only, no brand chrome (see below)
      page.tsx                  # workspace picker, or auto-redirect to the last-visited workspace
      dashboard/page.tsx          # Master Executive Dashboard — admin-only, cross-brand
      [brand]/
        layout.tsx                 # resolves+locks the brand from the URL segment, renders WorkspaceShell
        products/page.tsx            # Products page
        inventory/page.tsx             # Inventory page: Stock Levels / Record Movement tabs
        orders/page.tsx                  # Order History dashboard
        orders/new/page.tsx                # manual order entry form
        orders/[id]/page.tsx                 # order detail + Process Return
    components/
      layout/
        WorkspaceShell.tsx        # WorkspaceProvider + DashboardShell, mounted by [brand]/layout.tsx
        DashboardShell.tsx          # Header + Sidebar + MobileBottomNav + content slot
        Header.tsx                    # top bar: locked brand's badge/name + WorkspaceSwitcher
        WorkspaceSwitcher.tsx           # navigates to the equivalent page under a different /[brand]/
        Sidebar.tsx                       # desktop/tablet-landscape nav (hidden below md)
        MobileBottomNav.tsx                 # phone/tablet-portrait bottom tab bar (hidden md+)
        navigation.ts                         # nav item list (relative segments) + brand-prefixed href builder
        icons.tsx                               # small inline SVG icons, no icon library dependency
      products/
        ProductList.tsx    # SWR fetch, locked to the workspace brand -> ProductCard grid
        ProductCard.tsx      # one product: name, category badge, variant list
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
        OrderList.tsx           # dashboard: status filter, locked to the workspace brand -> order rows
        OrderStatusBadge.tsx      # status -> Badge color/label map
        CreateOrderForm.tsx         # manual order entry: customer fields + repeatable items (brand implicit)
        OrderItemRow.tsx               # one order line: reuses VariantScanInput/BinSelect/QuantityInput
        OrderDetail.tsx                   # order header + items + return history, "Process Return" per item
        ReturnModal.tsx                      # quantity/reason/disposition(+bin)/notes -> POST /api/returns
      dashboard/
        StatTile.tsx              # one KPI number (Total Revenue, Total Orders, ...)
        BrandComparison.tsx         # per-brand revenue bar + stats row, links into that brand's workspace
        RecentMovementsList.tsx       # global (both-brand) stock movement feed
      ui/
        Badge.tsx, Spinner.tsx, EmptyState.tsx, ComingSoon.tsx
    context/
      WorkspaceContext.tsx    # the locked brand for this route subtree, resolved from the URL — no setter
    hooks/
      useAllBins.ts               # every bin across the warehouse, flattened with zone code
      useVariantStock.ts            # per-bin on-hand quantity for one variant
      useCurrentUser.ts                # TEMPORARY: hardcoded { role: 'admin' } until login exists
      useLastWorkspaceCode.ts            # SSR-safe read of the last-visited workspace (for "/"'s auto-redirect)
    lib/
      apiClient.ts          # fetch wrapper: unwraps the backend's {success,data} envelope
      auth.ts                 # placeholder for attaching a JWT once login exists
      env.ts                    # NEXT_PUBLIC_API_URL
      types.ts                    # TS types mirroring backend response shapes
      brandColor.ts                 # deterministic per-brand accent color (hash of brand.code)
      lastWorkspace.ts                # write side of "last visited workspace" (read side is the hook above)
      brands.ts, categories.ts, products.ts, variants.ts, warehouses.ts, inventory.ts,
      reasonCodes.ts, orders.ts, returns.ts, dashboard.ts                              # typed API functions per domain
```

## Layout & responsiveness

`DashboardShell` renders a left sidebar on `md:` and wider screens, and
switches to a fixed bottom tab bar below that — a bottom bar is more
thumb-reachable than a hamburger drawer for staff holding a phone or tablet
while walking the warehouse floor. Both navs share one `NAV_ITEMS` list
(`components/layout/navigation.ts`) so adding a page only means updating one
array plus its icon.

## Strict brand isolation: workspaces, not a filter (Step 7)

Earlier steps had a single unified app with a header dropdown that filtered
every list by brand — including an "All Brands" option. That's exactly the
kind of thing that lets a mistake happen: nothing stopped a warehouse worker
from having the wrong brand selected while recording a movement. Step 7
replaces the filter with **workspace isolation**: the active brand lives in
the URL (`/[brand]/products`, `/[brand]/inventory`, ...), and there is no
client-side control anywhere that can silently change what brand a page's
data belongs to.

- **`WorkspaceContext`** (`context/WorkspaceContext.tsx`) replaces the old
  `BrandContext`. It has no setter. `WorkspaceProvider`, mounted by
  `app/[brand]/layout.tsx`, resolves the `[brand]` URL segment (a lowercased
  brand code, e.g. `alh`) against `GET /api/brands` and locks the entire
  subtree to that brand. An unknown code (`/xyz/products`) redirects to `/`
  — there's no way to render the shell "locked to nothing."
- **`WorkspaceSwitcher`** (replaces `BrandToggle`) is a real navigation, not
  a state mutation: picking a different brand calls `router.push` to the
  *equivalent* page under that brand's `/[brand]/...` (dropping anything
  brand-specific and deeper, like a specific order id, since it wouldn't
  translate).
- **The header** shows only the locked brand's badge and name — the old
  combined "Alia Hijab & Noori" logo and "All Brands" option are both gone.
  Each brand gets a deterministic accent color (`lib/brandColor.ts`, a hash
  of `brand.code` into a small palette — not a hardcoded per-brand
  if/else, so a 3rd/4th brand gets a consistent color automatically) shown
  as the header badge, the workspace-picker cards, and the dashboard's
  brand rows, so "which brand am I in" stays visually obvious everywhere.
- **`/` is a workspace picker**, not a redirect to a fixed page. A returning
  visitor is auto-redirected straight to their last-visited workspace
  (`hooks/useLastWorkspaceCode.ts`, read via `useSyncExternalStore` for the
  same SSR-safety reason `BrandContext` used it — see below); a first-time
  visitor (or one with no matching last workspace) sees brand-picker cards.
- **The cross-brand SKU guard** is the mechanism that actually prevents the
  mistake this refactor is about. `VariantScanInput` takes an optional
  `expectedBrand` prop; every caller inside a workspace (`InboundForm`,
  `OutboundForm`, `TransferForm`, `OrderItemRow`) passes the locked
  `workspace.brand`. The by-SKU lookup endpoint has no brand awareness (any
  SKU resolves regardless of which workspace you're in), so without this
  check a Noori staff member scanning an Alia Hijab label inside the Noori
  workspace would have been silently allowed to move Alia Hijab stock.
  Now it's rejected inline: `"ALH-HIJ-00001-... belongs to Alia Hijab, not
  Noori — wrong workspace."`
- **`CreateOrderForm`** no longer has a brand `<select>` at all — the order's
  brand is `workspace.brand.id`, full stop. There's nothing to pick wrong.

Two lint-rule-driven design notes carried over/extended from earlier
steps: `useSyncExternalStore` (not `useEffect` + `setState` on mount) is
used for every localStorage read that affects initial render output,
because that pattern both risks an SSR/hydration mismatch and trips the
`react-hooks/set-state-in-effect` lint rule this Next.js version ships
with. `app/page.tsx`'s auto-redirect effect only ever calls
`router.replace` (a navigation, not a state setter) — the "should we
redirect" decision is a derived value from SWR data + the synced-store
read, not separate `useState`, so there's no `setState`-in-effect at all.

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
  against the new `GET /api/inventory` endpoint — brand isn't a filter
  option here at all, since the whole page is already locked to one.

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

`/[brand]/orders` has three views: a **history dashboard** (list,
filterable by status; brand is implicit in the URL), a **New Order** form,
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

## Master Executive Dashboard (Step 7)

`/dashboard` is the one page that deliberately isn't inside `/[brand]/...`
— it's the admin's cross-brand view, so it can't be brand-locked. It has
its own minimal header (not `DashboardShell`, which is brand-specific
chrome) with a link back to the workspace picker.

- Gated by `useCurrentUser().role === 'admin'`
  (`hooks/useCurrentUser.ts`, the same kind of temporary hardcoded
  placeholder as `lib/auth.ts` — there's no login yet, so there's no real
  role to check). A non-admin is redirected to `/`. This is a **UI
  convenience only**; the real enforcement is server-side
  (`requireRole('admin')` on `GET /api/dashboard/summary`), so it doesn't
  matter that the frontend check is currently hardcoded to always pass.
- **`StatTile`** ×4: Total Revenue, Total Orders, Inventory Value, Units in
  Stock — combined across both brands.
- **`BrandComparison`**: one row per brand (revenue, inventory value, units,
  order count) with a simple width-percentage revenue bar — no charting
  library, just a styled div — colored with the same deterministic
  per-brand accent used everywhere else. Each row links into that brand's
  workspace, so "drill down from company view into a specific brand" is one
  click.
- **`RecentMovementsList`**: the latest 20 stock movements across *both*
  brands (from `GET /api/dashboard/summary`), each tagged with a small
  brand-colored dot — the one list in the whole app that intentionally
  mixes brands.

## Backend additions needed for this step

- `GET /api/dashboard/summary` (**admin-only**, enforced server-side) —
  per-brand revenue/inventory value/order count + totals + the last 20
  stock movements across both brands. See the backend README's "Master
  Executive Dashboard: the one deliberately cross-brand endpoint" for the
  revenue/inventory-value query design.

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
- **Step 7**: seeded products/stock/orders under *both* brands. Fresh
  browser, no localStorage: `/` showed the workspace picker (two brand
  cards + an admin "View Company Dashboard" link, no leftover "All Brands"
  or combined-logo text anywhere — asserted directly against the page's
  text content). Picked Alia Hijab → landed on `/alh/products`, sidebar/
  bottom-nav links all correctly prefixed. On the Inventory Inbound form,
  scanned a real Noori SKU while inside the Alia Hijab workspace and got
  the expected `belongs to Noori, not Alia Hijab — wrong workspace`
  rejection. Used the WorkspaceSwitcher to jump to Noori, landing on the
  *equivalent* page (`/noo/inventory`, not reset to `/noo/products`);
  confirmed the reverse cross-brand rejection (an Alia Hijab SKU scanned in
  the Noori workspace) and that a real Noori SKU resolved normally.
  Visited an invalid brand code (`/xyz/products`) with no last-visited
  workspace and confirmed it lands on the picker — then, after visiting
  Noori again, confirmed `/` now auto-redirects straight there with no
  picker flash. Finally opened the Company Dashboard and confirmed the
  combined totals matched the seeded data exactly (revenue 750 + 660 =
  1410 EGP, inventory value 3750 + 2640 = 6390 EGP, 37 total units, 2
  orders), the per-brand comparison bars, and all four movements from both
  brands present and correctly ordered in Recent Activity. Zero browser
  console errors across the entire run. `npm run build` and `npm run lint`
  pass clean.
