import { OrderDetail } from "@/components/orders/OrderDetail";

// `params` is a Promise on this Next.js version (App Router convention
// since Next 15, unrelated to whether Cache Components is enabled) — must
// be awaited in a Server Component before the resolved id can be handed to
// the Client Component that actually renders the order.
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The heading lives inside OrderDetail (a Client Component) rather than
  // here — it needs useLocale() to translate, which a Server Component can't call.
  return (
    <div className="mx-auto max-w-3xl">
      <OrderDetail orderId={id} />
    </div>
  );
}
