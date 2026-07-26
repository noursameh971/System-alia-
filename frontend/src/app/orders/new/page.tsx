import { CreateOrderForm } from "@/components/orders/CreateOrderForm";

export default function NewOrderPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New Order</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          For retail/wholesale entry. Each item&apos;s stock is deducted from the bin you choose as soon as the
          order is created.
        </p>
      </div>
      <CreateOrderForm />
    </div>
  );
}
