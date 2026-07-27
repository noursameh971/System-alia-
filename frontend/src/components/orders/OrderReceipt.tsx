"use client";

import { useEffect } from "react";
import type { OrderDetail } from "@/lib/types";
import { getBrandAccentClass } from "@/lib/brandColor";

/**
 * Printable invoice for one order. Isolated via the shared .print-area
 * convention (see globals.css) so only this renders when the browser's
 * print dialog opens — the dashboard chrome, sidebar, and nav behind it
 * are hidden by @media print, not just visually covered.
 */
export function OrderReceipt({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const total = order.items.reduce((sum, item) => sum + item.subtotal, 0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900/50 print:bg-white" onClick={onClose}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-xl print:hidden dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Print Receipt</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Print
            </button>
          </div>
        </div>

        <div
          id="order-receipt-print-area"
          className="print-area rounded-xl bg-white p-6 shadow-xl print:rounded-none print:p-0 print:shadow-none sm:p-8 dark:bg-slate-900 print:dark:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-slate-200 pb-4 print:border-black">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white ${getBrandAccentClass(order.brand.code)}`}
              >
                {order.brand.code}
              </span>
              <div>
                <p className="text-lg font-semibold text-slate-900 print:text-black dark:text-slate-100">
                  {order.brand.name}
                </p>
                <p className="text-xs text-slate-500 print:text-black dark:text-slate-400">Sales Receipt</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-slate-900 print:text-black dark:text-slate-100">
                {order.orderNumber}
              </p>
              <p className="text-xs text-slate-500 print:text-black dark:text-slate-400">
                {new Date(order.orderDate).toLocaleString()}
              </p>
            </div>
          </div>

          {order.customerName || order.customerPhone || order.customerAddress ? (
            <div className="mt-4 border-b border-slate-100 pb-4 text-sm text-slate-700 print:border-black print:text-black dark:border-slate-800 dark:text-slate-300">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 print:text-black dark:text-slate-500">
                Bill to
              </p>
              {order.customerName ? <p className="font-medium">{order.customerName}</p> : null}
              {order.customerPhone ? <p>{order.customerPhone}</p> : null}
              {order.customerAddress ? <p>{order.customerAddress}</p> : null}
            </div>
          ) : null}

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 print:border-black print:text-black dark:border-slate-800 dark:text-slate-500">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 print:border-black print:border-dashed dark:border-slate-800"
                >
                  <td className="py-2 pr-2 text-slate-900 print:text-black dark:text-slate-100">
                    <p className="font-medium">{item.productName}</p>
                    <p className="font-mono text-xs text-slate-500 print:text-black dark:text-slate-400">{item.sku}</p>
                  </td>
                  <td className="py-2 text-right text-slate-700 print:text-black dark:text-slate-300">{item.quantity}</td>
                  <td className="py-2 text-right text-slate-700 print:text-black dark:text-slate-300">
                    {item.unitPriceAtSale.toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-medium text-slate-900 print:text-black dark:text-slate-100">
                    {item.subtotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-200 pt-3 print:border-black">
            <span className="text-sm font-medium text-slate-600 print:text-black dark:text-slate-400">Total</span>
            <span className="text-lg font-semibold text-slate-900 print:text-black dark:text-slate-100">
              {total.toFixed(2)} EGP
            </span>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 print:text-black dark:text-slate-500">
            Thank you for shopping with {order.brand.name}.
          </p>
        </div>
      </div>
    </div>
  );
}
