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

export interface BulkUpdateCategoryResult {
  categoryId: string;
  categoryName: string;
  updatedCount: number;
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
  | { movementType: "transfer"; fromBinId: string; toBinId: string; items: BatchMovementItemInput[] }
  | {
      movementType: "return";
      condition: "good" | "damaged";
      /** Restock destination — required when condition is "good", omitted for "damaged" (audit-only, never restocked). */
      toBinId?: string;
      reason?: string;
      items: BatchMovementItemInput[];
    };

export interface BatchMovementResult {
  movementType: BatchMovementInput["movementType"];
  itemCount: number;
  totalQuantity: number;
  results: MovementResult[];
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

/** One point per day (oldest first) — powers each KPI card's sparkline. inventoryUnits/inventoryValue are end-of-day absolute levels; revenue/orderCount/expenses/netProfit are that day's own totals. */
export interface DashboardTrendPoint {
  day: string;
  revenue: number;
  orderCount: number;
  inventoryUnits: number;
  inventoryValue: number;
  /** That day's production cost (COGS) + shipping fees. */
  expenses: number;
  /** That day's revenue - expenses. */
  netProfit: number;
}

export interface BrandDashboardSummary {
  brand: Brand;
  revenue: number;
  orderCount: number;
  inventoryValue: number;
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

export type Role = "admin" | "warehouse_staff";

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
  /** Required when role is "warehouse_staff", must be omitted for "admin". */
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
}

/** brandId is absent by design — moving an expense between workspaces would rewrite two brands' P&L. */
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
  grossRevenue: number;
  cogs: number;
  shipping: number;
  operatingExpenses: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  orderCount: number;
  expenseCount: number;
  byCategory: ExpenseCategoryTotals;
  monthly: MonthlyExpensePoint[];
}

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
}

export interface RecordPaymentInput {
  amount: number;
  transactionDate?: string;
  notes?: string;
}

/** Finance page's Accounts Payable / Accounts Receivable / Net Cash Flow cards. */
export interface CashFlowSummary {
  accountsPayable: number;
  accountsReceivable: number;
  netCashFlow: number;
}
