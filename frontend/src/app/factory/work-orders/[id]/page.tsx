import { WorkOrderDetail } from "@/components/factory/WorkOrderDetail";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetail workOrderId={id} />;
}
