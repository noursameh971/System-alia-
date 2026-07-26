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
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  status: string;
  brand: Brand;
  category: { id: string; name: string; code: string };
  variants: ProductVariant[];
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

export type ReasonScope = "stock_movement" | "return" | "both";

export interface ReasonCode {
  id: string;
  code: string;
  label: string;
  appliesTo: ReasonScope;
}

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string | null;
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
  attributes: ProductVariantAttribute[];
  quantity: number;
  unitPriceAtSale: number;
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
  orderDate: string;
  brand: Brand;
  items: OrderDetailItem[];
}

export interface CreatedOrderItem {
  id: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPriceAtSale: number;
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
