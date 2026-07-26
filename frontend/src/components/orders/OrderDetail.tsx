"use client";

import { useState } from "react";
import useSWR from "swr";
import { getOrder } from "@/lib/orders";
import { listReturns } from "@/lib/returns";
import { ApiError } from "@/lib/apiClient";
import type { OrderDetailItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { ReturnModal } from "./ReturnModal";

export function OrderDetail({ orderId }: { orderId: string }) {
  const {
    data: order,
    error,
    isLoading,
    mutate: mutateOrder,
  } = useSWR(["order", orderId], () => getOrder(orderId));
  const { data: returnHistory, mutate: mutateReturns } = useSWR(["returns", orderId], () => listReturns(orderId));

  const [returningItem, setReturningItem] = useState<OrderDetailItem | null>(null);

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

  const total = order.items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                {order.orderNumber}
              </h2>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {new Date(order.orderDate).toLocaleString()}
            </p>
          </div>
          <Badge variant="brand">{order.brand.name}</Badge>
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

        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 dark:bg-slate-950">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Order total</span>
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{total.toFixed(2)} EGP</span>
        </div>
      </div>

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
                  <span className="ml-2 text-slate-700 dark:text-slate-300">{r.reasonLabel}</span>
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
    </div>
  );
}
