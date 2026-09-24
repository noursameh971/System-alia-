export interface Brand {
  id: string;
  name: string;
  code: string;
}

export interface ProductVariantAttribute {
  attributeName: string;
  value: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  qrCodeValue: string;
  status: string;
  attributes: ProductVariantAttribute[];
  price: number | null;
  currency: string | null;
  /** Production/unit cost — null if never set (cost tracking is opt-in, unlike price). */
  cost: number | null;
  /** Sum of on-hand quantity across every bin this variant has inventory in. */
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: string;
  /** Manual display position within the brand's Products page — lower sorts first. */
  sortOrder: number;
  brand: Brand;
  category: { id: string; name: string; code: string };
  variants: ProductVariant[];
}

export interface QuickVariantInput {
  color: string;
  size: string;
  price: number;
  /** Production/unit cost — optional, unlike price. */
  cost?: number;
  initialStock: number;
}

export interface QuickCreateProductInput {
  brandId: string;
  name: string;
  /** Free text — get-or-created by name; omitted or blank falls back to the backend's default "General" category. */
  category?: string;
  /** An external URL, set on creation. File uploads happen as a second step (see uploadProductImage) since the upload endpoint needs a productId that doesn't exist until after this call succeeds. */
  imageUrl?: string;
  variants: QuickVariantInput[];
}

export interface QuickCreateProductResult {
  productId: string;
  variants: { variantId: string; sku: string }[];
}

export interface AddVariantResult {
  variantId: string;
  sku: string;
}

export type VariantStatus = "active" | "discontinued";

export interface UpdateProductVariantInput {
  name?: string;
  color?: string;
  size?: string;
  price?: number;
  cost?: number;
  status?: VariantStatus;
  /** Empty string explicitly clears the image; omit the field to leave it untouched. */
  imageUrl?: string;
}

export interface UploadProductImageResult {
  imageUrl: string;
}

export interface UpdateProductVariantResult {
  productId: string;
  variantId: string;
}

export interface DeleteVariantResult {
  /** True if the row was actually removed; false if it had order/movement history and was archived (status set to "discontinued") instead. */
  deleted: boolean;
}

export interface SetVariantStockResult {
  variantId: string;
  stock: number;
}

export interface UpdateProductPriceResult {
  productId: string;
  price: number;
  variantCount: number;
}

export interface UpdateProductCostResult {
  productId: string;
  cost: number;
  variantCount: number;
}

export interface UpdateProductCategoryResult {
  productId: string;
  categoryId: string;
  categoryName: string;
}

export interface ReorderProductResult {
  productId: string;
  /** The neighbor product it swapped positions with, or null if it was already at that end of the order. */
  swappedWithProductId: string | null;
}

export interface UpdateProductInfoInput {
  name?: string;
  /** Empty string explicitly clears the image; omit to leave it untouched. */
  imageUrl?: string;
}

export interface UpdateProductInfoResult {
  productId: string;
  name: string;
  imageUrl: string | null;
}

export interface BulkUpdateCategoryResult {
  categoryId: string;
  categoryName: string;
  updatedCount: number;
}

export interface BulkDeleteProductsResult {
  requestedCount: number;
  deletedCount: number;
  archivedCount: number;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportProductsResult {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface ImportOrdersResult {
  totalRows: number;
  ordersCreated: number;
  itemsImported: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface Category {
  id: string;
  name: string;
  code: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}

export interface WarehouseZone {
  id: string;
  warehouseId: string;
  code: string;
  name: string | null;
}

export interface WarehouseBin {
  id: string;
  zoneId: string;
  code: string;
}

/** A bin flattened with its zone code, used by the bin pickers on the movement forms. */
export interface FlatBin extends WarehouseBin {
  zoneCode: string;
}

export interface VariantInventoryRow {
  binId: string;
  binCode: string;
  zoneCode: string;
  quantity: number;
  updatedAt: string;
}

export interface InventoryRow {
  variantId: string;
  sku: string;
  productName: string;
  imageUrl: string | null;
  brand: Brand;
  category: { id: string; name: string };
  attributes: ProductVariantAttribute[];
  binId: string;
  binCode: string;
  zoneId: string;
  zoneCode: string;
  quantity: number;
  updatedAt: string;
}

export interface VariantLookupResult {
  id: string;
  sku: string;
  qrCodeValue: string;
  status: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  brand: Brand;
  category: { id: string; name: string };
  attributes: ProductVariantAttribute[];
  price: number | null;
  currency: string | null;
}

export interface MovementResult {
  movementId: string;
  variantId: string;
  quantity: number;
  fromBinId: string | null;
  toBinId: string | null;
  fromBinQuantityAfter: number | null;
  toBinQuantityAfter: number | null;
}

export interface BatchMovementItemInput {
  variantId: string;
  quantity: number;
}

/** The Inventory page's Scanned Batch Queue payload — one shared bin/condition context applied to every item, in a single backend transaction. */
export type BatchMovementInput =
  | { movementType: "inbound"; toBinId: string; items: BatchMovementItemInput[] }
  | { movementType: "outbound"; fromBinId: string; items: BatchMovementItemInput[] }
  | { movementType: "gift"; fromBinId: string; items: BatchMovementItemInput[] }
  | { movementType: "transfer"; fromBinId: string; toBinId: string; items: BatchMovementItemInput[] }
  | {
      movementType: "return";
      condition: "good" | "damaged";
      /** Restock destination — required when condition is "good", omitted for "damaged" (audit-only, never restocked). */
      toBinId?: string;
      reason?: string;
      items: BatchMovementItemInput[];
    };

/** A queued line the source bin couldn't cover — reported back per line so the operator can fix just that count instead of losing the whole batch. */
export interface SkippedBatchItem {
  variantId: string;
  requested: number;
  available: number;
}

export interface BatchMovementResult {
  movementType: BatchMovementInput["movementType"];
  itemCount: number;
  totalQuantity: number;
  results: MovementResult[];
  /** Empty for a fully-applied batch. These lines were left untouched and stay in the scan queue. */
  skipped: SkippedBatchItem[];
}

export interface RecentMovementLogItem {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: string;
  sku: string;
  productName: string;
  performedByName: string;
  reasonLabel: string | null;
  notes: string | null;
}

export type ReasonScope = "stock_movement" | "return" | "both";

export interface ReasonCode {
  id: string;
  code: string;
  label: string;
  appliesTo: ReasonScope;
}

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export type OrderPaymentMethod = "cod" | "online";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: OrderPaymentMethod;
  shippingFee: number;
  orderDate: string;
  brand: Brand;
  itemCount: number;
  total: number;
}

export interface OrderDetailItem {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  imageUrl: string | null;
  attributes: ProductVariantAttribute[];
  quantity: number;
  unitPriceAtSale: number;
  costAtSale: number;
  subtotal: number;
  returnedQuantity: number;
  returnableQuantity: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  paymentMethod: OrderPaymentMethod;
  shippingFee: number;
  orderDate: string;
  /** Extended with logoUrl/receiptNotes (unlike the plain Brand type) so OrderReceipt can print them without a second fetch. */
  brand: Brand & { logoUrl: string | null; receiptNotes: string | null };
  items: OrderDetailItem[];
  /** sum(item.quantity * item.costAtSale) — the order's total production cost (COGS). */
  totalProductionCost: number;
  /** Revenue (sum of item subtotals) minus (totalProductionCost + shippingFee). */
  netProfit: number;
  /** netProfit / revenue * 100, or 0 when revenue is 0. */
  profitMargin: number;
}

export interface CreatedOrderItem {
  id: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPriceAtSale: number;
  costAtSale: number;
  subtotal: number;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  brandId: string;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  paymentMethod: OrderPaymentMethod;
  shippingFee: number;
  orderDate: string;
  items: CreatedOrderItem[];
}

export type ReturnDisposition = "restock" | "write_off";

export interface CreatedReturn {
  id: string;
  orderId: string;
  orderItemId: string;
  variantId: string;
  sku: string;
  quantity: number;
  disposition: ReturnDisposition;
  restockBinId: string | null;
  reasonCodeId: string;
}

export interface ReturnListItem {
  id: string;
  orderId: string;
  orderItemId: string;
  sku: string;
  quantity: number;
  disposition: ReturnDisposition;
  reasonLabel: string;
  restockBinId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DashboardBrandSummary {
  id: string;
  name: string;
  code: string;
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  /** qty * current active selling price, summed across this brand's stock. */
  potentialRetailValue: number;
  inventoryUnitCount: number;
  /** Production cost (COGS) + shipping fees across this brand's non-cancelled orders. */
  totalExpenses: number;
  /** revenue - totalExpenses. */
  netProfit: number;
  /** netProfit / revenue * 100, or 0 when revenue is 0. */
  profitMargin: number;
}

export interface DashboardTotals {
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  /** qty * current active selling price, summed across every brand's stock. */
  potentialRetailValue: number;
  inventoryUnitCount: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
}

export interface DashboardMovement {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: string;
  sku: string;
  productName: string;
  brand: Brand;
}

export interface DashboardSummary {
  brands: DashboardBrandSummary[];
  totals: DashboardTotals;
  recentMovements: DashboardMovement[];
  activeBrandCount: number;
}

export interface TopSellingItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  quantitySold: number;
  revenue: number;
}

export interface LowStockItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  stock: number;
}

export interface BrandRecentMovement {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: string;
  sku: string;
  productName: string;
}

export interface TopStockedItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  stock: number;
}

export interface CategoryValueItem {
  categoryId: string;
  categoryName: string;
  inventoryValue: number;
}

/** One point per day (oldest first) — powers each KPI card's sparkline. inventoryUnits/inventoryValue/potentialRetailValue are end-of-day absolute levels; revenue/orderCount/expenses/netProfit are that day's own totals. */
export interface DashboardTrendPoint {
  day: string;
  revenue: number;
  orderCount: number;
  inventoryUnits: number;
  /** qty * cost — money invested in stock. */
  inventoryValue: number;
  /** qty * selling price — what the same stock would bring in if sold at retail. */
  potentialRetailValue: number;
  /** That day's production cost (COGS) + shipping fees. */
  expenses: number;
  /** That day's revenue - expenses. */
  netProfit: number;
}

export interface BrandDashboardSummary {
  brand: Brand;
  revenue: number;
  orderCount: number;
  /**
   * qty * production cost — money invested in stock (a cost/asset basis),
   * not what it would sell for. Reads low (or 0) for a variant with no
   * production cost recorded yet — cost tracking is opt-in, unlike selling
   * price.
   */
  inventoryValue: number;
  /** qty * current selling price — the total value of on-hand stock if sold at retail. */
  potentialRetailValue: number;
  inventoryUnitCount: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  topSellingItems: TopSellingItem[];
  topStockedItems: TopStockedItem[];
  lowStockItems: LowStockItem[];
  categoryBreakdown: CategoryValueItem[];
  recentMovements: BrandRecentMovement[];
  trend: DashboardTrendPoint[];
}

export interface CreateBrandInput {
  name: string;
  code: string;
}

export type CreateBrandResult = Brand;

export type Role = "admin" | "warehouse_staff" | "finance";

export interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  brand: Brand | null;
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  /** Required unless role is "admin" (i.e. for "warehouse_staff" and "finance"), must be omitted for "admin". */
  brandId?: string;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: Role;
  /** Explicit null clears the assignment (switching to admin); omit to leave unchanged. */
  brandId?: string | null;
  isActive?: boolean;
}

export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type AppLocale = "en" | "ar";

/** Single-row global settings — Settings page's "General & Localization" + "Inventory & Operations" tabs. */
export interface AppSettings {
  lowStockThreshold: number;
  defaultCurrency: string;
  dateFormat: DateFormat;
  defaultLanguage: AppLocale;
}

export interface UpdateSettingsInput {
  lowStockThreshold?: number;
  defaultCurrency?: string;
  dateFormat?: DateFormat;
  defaultLanguage?: AppLocale;
}

/** Settings page's "Brand Profile" tab. */
export interface BrandProfile {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  receiptNotes: string | null;
}

export interface UpdateBrandProfileInput {
  name?: string;
  receiptNotes?: string;
}

export interface UploadBrandLogoResult {
  logoUrl: string;
}

// ------------------------------------------------------------------ Finance

export const EXPENSE_CATEGORIES = ["marketing", "salaries", "production", "packaging", "rent", "misc"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_PAYMENT_METHODS = ["cash", "bank_transfer", "card", "instapay", "other"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

/** One row in the Finance page's expense ledger. */
export interface Expense {
  id: string;
  brandId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  paymentMethod: ExpensePaymentMethod;
  /** YYYY-MM-DD — a calendar day, not an instant. */
  expenseDate: string;
  receiptUrl: string | null;
  notes: string | null;
  /** Set when this expense also pays down a specific supplier's payable balance in the Suppliers & Debts Ledger. */
  ledgerEntityId: string | null;
  /** The linked supplier's name, joined in server-side — null when not linked. */
  ledgerEntityName: string | null;
  createdAt: string;
}

export interface CreateExpenseInput {
  brandId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  expenseDate: string;
  receiptUrl?: string;
  notes?: string;
  /** Links this expense to a payable supplier — its amount is also recorded as a ledger payment reducing their Remaining Balance. */
  ledgerEntityId?: string | null;
}

/**
 * brandId is absent by design — moving an expense between workspaces would
 * rewrite two brands' P&L. ledgerEntityId carries its three-way meaning
 * through Partial unchanged: omitted = leave the existing link untouched,
 * null = unlink, a uuid = link/re-link.
 */
export type UpdateExpenseInput = Partial<Omit<CreateExpenseInput, "brandId">>;

export type ExpenseCategoryTotals = Record<ExpenseCategory, number>;

export interface MonthlyExpensePoint {
  /** YYYY-MM. */
  month: string;
  categories: ExpenseCategoryTotals;
  total: number;
}

/** The Finance page's KPI cards + monthly breakdown chart. */
export interface FinanceSummary {
  /** orderRevenue + manualRevenue. */
  grossRevenue: number;
  /** Revenue derived from placed orders. */
  orderRevenue: number;
  /** Hand-recorded revenue (see Revenue below) — income that never became an Order row. */
  manualRevenue: number;
  cogs: number;
  shipping: number;
  operatingExpenses: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  orderCount: number;
  revenueCount: number;
  expenseCount: number;
  byCategory: ExpenseCategoryTotals;
  monthly: MonthlyExpensePoint[];
}

export const REVENUE_CATEGORIES = ["product_sales", "wholesale", "shipping_income", "other"] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

/** One row in the Finance page's hand-recorded revenue ledger — income (a wholesale invoice, an in-person/DM sale, etc.) that never became an Order row. */
export interface Revenue {
  id: string;
  brandId: string;
  source: string;
  category: RevenueCategory;
  amount: number;
  currency: string;
  /** YYYY-MM-DD — a calendar day, not an instant. */
  revenueDate: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateRevenueInput {
  brandId: string;
  source: string;
  category: RevenueCategory;
  amount: number;
  revenueDate: string;
  notes?: string;
}

/** brandId is absent by design — moving revenue between workspaces would rewrite two brands' P&L. */
export type UpdateRevenueInput = Partial<Omit<CreateRevenueInput, "brandId">>;

export interface ImportSectionResult {
  created: number;
  skipped: number;
  errors: string[];
}

/** POST /api/expenses/import's response — one section per sheet the uploaded workbook actually contained. A section is null (not zero) when its sheet was absent, so the UI can tell "nothing to import" apart from "no such sheet". */
export interface ImportFinanceResult {
  expenses: ImportSectionResult | null;
  ledger: ImportSectionResult | null;
}

// ------------------------------------------------------- Suppliers & Debts Ledger

export const LEDGER_ENTITY_CATEGORIES = ["fabric", "stitching", "packaging", "courier", "other"] as const;
export type LedgerEntityCategory = (typeof LEDGER_ENTITY_CATEGORIES)[number];

export const LEDGER_BALANCE_TYPES = ["payable", "receivable"] as const;
export type LedgerBalanceType = (typeof LEDGER_BALANCE_TYPES)[number];

/** One supplier/courier/client row in the Suppliers & Debts Ledger table, with its running totals computed server-side. */
export interface LedgerEntity {
  id: string;
  brandId: string;
  name: string;
  category: LedgerEntityCategory;
  balanceType: LedgerBalanceType;
  phone: string | null;
  notes: string | null;
  totalBilled: number;
  amountPaid: number;
  /** totalBilled - amountPaid. Can be negative (a credit/overpayment). */
  remainingBalance: number;
  createdAt: string;
}

export interface CreateOpeningBalanceInput {
  brandId: string;
  entityName: string;
  category: LedgerEntityCategory;
  balanceType: LedgerBalanceType;
  amount: number;
  dueDate?: string;
  notes?: string;
  receiptUrl?: string;
}

export interface RecordPaymentInput {
  amount: number;
  transactionDate?: string;
  notes?: string;
}

export const LEDGER_TRANSACTION_KINDS = ["opening_balance", "charge", "payment"] as const;
export type LedgerTransactionKind = (typeof LEDGER_TRANSACTION_KINDS)[number];

/** One row in a supplier's transaction history — an opening balance, a bill/charge, or a payment. */
export interface LedgerTransaction {
  id: string;
  entityId: string;
  kind: LedgerTransactionKind;
  amount: number;
  transactionDate: string;
  dueDate: string | null;
  notes: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

/** The Supplier Detail page's main data source. */
export interface LedgerEntityDetail extends LedgerEntity {
  transactions: LedgerTransaction[];
}

export interface CreateChargeInput {
  amount: number;
  transactionDate?: string;
  dueDate?: string;
  notes?: string;
}

/** "Edit Supplier Info" — balanceType isn't editable, see the backend schema's comment on why. */
export interface UpdateLedgerEntityInput {
  name?: string;
  category?: LedgerEntityCategory;
  phone?: string;
  notes?: string;
}

/** Editing/adjusting one existing transaction — kind isn't editable, see the backend schema's comment. */
export interface UpdateLedgerTransactionInput {
  amount?: number;
  transactionDate?: string;
  dueDate?: string | null;
  notes?: string;
}

/** Finance page's Accounts Payable / Accounts Receivable / Net Cash Flow cards. */
export interface CashFlowSummary {
  accountsPayable: number;
  accountsReceivable: number;
  netCashFlow: number;
}
