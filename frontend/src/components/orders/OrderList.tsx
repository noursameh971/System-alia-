"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useBrand } from "@/context/BrandContext";
import { listOrders } from "@/lib/orders";
import { ApiError } from "@/lib/apiClient";
import type { OrderStatus } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrderStatusBadge } from "./OrderStatusBadge";

const STATUS_OPTIONS: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

export function OrderList() {
  const { selectedBrandId } = useBrand();
  const [status, setStatus] = useState<OrderStatus | "">("");

  const {
    data: orders,
    error,
    isLoading,
  } = useSWR(["orders", selectedBrandId, status], () =>
    listOrders({ brandId: selectedBrandId, status: status || null }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
          className="rounded-lg border border-slate-300 py-2 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <Link
          href="/orders/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          + New Order
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading orders..." />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load orders"
          description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
        />
      ) : !orders || orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders created here or via the API will show up in this list." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {order.orderNumber}
                  </p>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {order.customerName ?? "No customer name"} · {order.brand.name} ·{" "}
                  {new Date(order.orderDate).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {order.total.toFixed(2)} EGP
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
