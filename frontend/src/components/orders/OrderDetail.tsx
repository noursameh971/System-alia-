"use client";

import { useState } from "react";
import useSWR from "swr";
import { getOrder } from "@/lib/orders";
import { listReturns } from "@/lib/returns";
import { ApiError } from "@/lib/apiClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import type { OrderDetailItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";
import { formatPrice } from "@/lib/formatPrice";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentMethodBadge } from "./PaymentMethodBadge";
import { ReturnModal } from "./ReturnModal";
import { OrderReceipt } from "./OrderReceipt";

export function OrderDetail({ orderId }: { orderId: string }) {
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const isAdmin = role === "admin";
  const {
    data: order,
    error,
    isLoading,
    mutate: mutateOrder,
  } = useSWR(["order", orderId], () => getOrder(orderId));
  const { data: returnHistory, mutate: mutateReturns } = useSWR(["returns", orderId], () => listReturns(orderId));

  const [returningItem, setReturningItem] = useState<OrderDetailItem | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  function handleReturnSuccess() {
    void mutateOrder();
    void mutateReturns();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading order..." />
      </div>
    );
  }

  if (error || !order) {
    return (
      <EmptyState
        title="Couldn't load this order"
        description={error instanceof ApiError ? error.message : "It may not exist."}
      />
    );
  }

  const itemsTotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = itemsTotal + order.shippingFee;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("Order")}</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                {order.orderNumber}
              </h2>
              <OrderStatusBadge status={order.status} />
              <PaymentMethodBadge method={order.paymentMethod} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {new Date(order.orderDate).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Print Receipt
          </button>
        </div>

        {order.customerName || order.customerPhone || order.customerAddress ? (
          <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            {order.customerName ? <p className="font-medium">{order.customerName}</p> : null}
            {order.customerPhone ? <p>{order.customerPhone}</p> : null}
            {order.customerAddress ? <p>{order.customerAddress}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProductThumbnail imageUrl={item.imageUrl} name={item.productName} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.productName}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.attributes.map((attr) => (
                    <Badge key={`${attr.attributeName}-${attr.value}`}>{attr.value}</Badge>
                  ))}
                  {item.returnedQuantity > 0 ? (
                    <Badge variant="warning">{item.returnedQuantity} returned</Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {item.quantity} × {item.unitPriceAtSale.toFixed(2)}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.subtotal.toFixed(2)} EGP
              </span>
              <button
                type="button"
                disabled={item.returnableQuantity === 0}
                onClick={() => setReturningItem(item)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Process Return
              </button>
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-1 bg-slate-50 px-4 py-3 dark:bg-slate-950">
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>Items</span>
            <span>{formatPrice(itemsTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>Shipping</span>
            <span>{formatPrice(order.shippingFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Order total</span>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="mb-2.5 text-xs font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-400">
            Financial summary
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Revenue</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatPrice(itemsTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Production cost</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatPrice(order.totalProductionCost)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Shipping</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatPrice(order.shippingFee)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Net profit</p>
              <p
                className={`text-sm font-semibold ${
                  order.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatPrice(order.netProfit)}{" "}
                <span className="font-normal text-slate-400 dark:text-slate-500">
                  ({order.profitMargin.toFixed(1)}%)
                </span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {returnHistory && returnHistory.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Return history</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            {returnHistory.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5 text-sm last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.sku}</span>
                  <span className="ms-2 text-slate-700 dark:text-slate-300">{r.reasonLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.disposition === "restock" ? "success" : "danger"}>
                    {r.disposition === "restock" ? "Restocked" : "Written off"}
                  </Badge>
                  <span className="text-slate-500 dark:text-slate-400">qty {r.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {returningItem ? (
        <ReturnModal item={returningItem} onClose={() => setReturningItem(null)} onSuccess={handleReturnSuccess} />
      ) : null}

      {showReceipt ? <OrderReceipt order={order} onClose={() => setShowReceipt(false)} /> : null}
    </div>
  );
}
