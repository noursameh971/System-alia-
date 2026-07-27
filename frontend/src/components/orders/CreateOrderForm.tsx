"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrder } from "@/lib/orders";
import { ApiError } from "@/lib/apiClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { MovementStatusBanner, type MovementStatus } from "@/components/inventory/MovementStatusBanner";
import { OrderItemRow, type OrderItemState } from "./OrderItemRow";

function emptyItem(): OrderItemState {
  return { variant: null, binId: "", quantity: "" };
}

export function CreateOrderForm() {
  const router = useRouter();
  const { brand } = useWorkspace();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [items, setItems] = useState<OrderItemState[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  const orderTotal = items.reduce(
    (sum, item) => sum + (item.variant?.price != null && item.quantity ? item.variant.price * Number(item.quantity) : 0),
    0,
  );

  function updateItem(index: number, next: OrderItemState) {
    setItems((prev) => prev.map((item, i) => (i === index ? next : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const readyItems = items.filter((item) => item.variant && item.binId && item.quantity);
    if (readyItems.length === 0) {
      setStatus({ kind: "error", message: "Add at least one item with a bin and quantity." });
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        brandId: brand.id,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        items: readyItems.map((item) => ({
          variantId: item.variant!.id,
          binId: item.binId,
          quantity: Number(item.quantity),
        })),
      });
      router.push(`/${brand.code.toLowerCase()}/orders/${order.id}`);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Failed to create order" });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Customer</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Customer name
            </label>
            <input
              type="text"
              aria-label="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Customer phone
            </label>
            <input
              type="text"
              aria-label="Customer phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Items</h2>
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <OrderItemRow
              key={index}
              item={item}
              onChange={(next) => updateItem(index, next)}
              onRemove={() => removeItem(index)}
              canRemove={items.length > 1}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Add another item
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{orderTotal.toFixed(2)} EGP</span>
        </div>
      </div>

      <MovementStatusBanner status={status} />

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Creating order..." : "Create Order"}
      </button>
    </form>
  );
}
