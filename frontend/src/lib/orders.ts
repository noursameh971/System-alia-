import { apiFetch } from "./apiClient";
import type { CreatedOrder, OrderDetail, OrderListItem, OrderStatus } from "./types";

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
  items: CreateOrderItemInput[];
}

export function createOrder(payload: CreateOrderInput): Promise<CreatedOrder> {
  return apiFetch<CreatedOrder>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
