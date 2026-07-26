import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/lib/types";

const STATUS_VARIANT: Record<OrderStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  pending: "warning",
  processing: "brand",
  shipped: "brand",
  delivered: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
