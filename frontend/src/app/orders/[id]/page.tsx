import { OrderDetail } from "@/components/orders/OrderDetail";

// `params` is a Promise on this Next.js version (App Router convention
// since Next 15, unrelated to whether Cache Components is enabled) — must
// be awaited in a Server Component before the resolved id can be handed to
// the Client Component that actually renders the order.
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Order</h1>
      </div>
      <OrderDetail orderId={id} />
    </div>
  );
}
