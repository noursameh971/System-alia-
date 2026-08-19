import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/context/LocaleContext";
import type { OrderPaymentMethod } from "@/lib/types";

const LABEL: Record<OrderPaymentMethod, string> = {
  cod: "COD",
  online: "Online",
};

export function PaymentMethodBadge({ method }: { method: OrderPaymentMethod }) {
  const { t } = useLocale();
  return <Badge variant={method === "online" ? "purple" : "neutral"}>{t(LABEL[method])}</Badge>;
}
