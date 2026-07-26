import { OrderList } from "@/components/orders/OrderList";

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Orders</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Order history for the brand selected above. Placing an order deducts stock immediately.
        </p>
      </div>
      <OrderList />
    </div>
  );
}
