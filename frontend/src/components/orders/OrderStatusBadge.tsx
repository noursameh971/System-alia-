import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/context/LocaleContext";
import type { OrderStatus } from "@/lib/types";

const STATUS_VARIANT: Record<OrderStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  processing: "brand",
  shipped: "info",
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
  const { t } = useLocale();
  return <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL[status])}</Badge>;
}
