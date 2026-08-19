import { apiFetch, apiFetchBlob, apiFetchUpload } from "./apiClient";
import type { CreatedOrder, ImportOrdersResult, OrderDetail, OrderListItem, OrderPaymentMethod, OrderStatus } from "./types";

export interface OrderFilters {
  brandId?: string | null;
  status?: OrderStatus | null;
}

export function listOrders(filters: OrderFilters): Promise<OrderListItem[]> {
  const params = new URLSearchParams();
  if (filters.brandId) params.set("brandId", filters.brandId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return apiFetch<OrderListItem[]>(`/api/orders${query ? `?${query}` : ""}`);
}

export function getOrder(orderId: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/api/orders/${orderId}`);
}

export interface CreateOrderItemInput {
  variantId: string;
  binId: string;
  quantity: number;
}

export interface CreateOrderInput {
  brandId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  paymentMethod: OrderPaymentMethod;
  shippingFee: number;
  items: CreateOrderItemInput[];
}

export function createOrder(payload: CreateOrderInput): Promise<CreatedOrder> {
  return apiFetch<CreatedOrder>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Backs the Orders table's inline "Change Status" action. */
export function updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/** Backs the "Export Excel" button — a full .xlsx of every order/item for the workspace. */
export function exportOrdersWorkbook(brandId: string): Promise<Blob> {
  return apiFetchBlob(`/api/orders/export?brandId=${encodeURIComponent(brandId)}`);
}

/** Backs the "Import Excel" button — uploads a .xlsx to bulk-create orders. */
export function importOrdersWorkbook(brandId: string, file: File): Promise<ImportOrdersResult> {
  return apiFetchUpload<ImportOrdersResult>(`/api/orders/import?brandId=${encodeURIComponent(brandId)}`, file);
}
