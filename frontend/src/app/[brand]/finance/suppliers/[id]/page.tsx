import { SupplierDetail } from "@/components/finance/SupplierDetail";

// `params` is a Promise on this Next.js version — must be awaited in a
// Server Component before the resolved id can be handed to the Client
// Component that actually renders the supplier. See orders/[id]/page.tsx.
export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-4xl">
      <SupplierDetail entityId={id} />
    </div>
  );
}
