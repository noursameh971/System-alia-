"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Download, Plus, Search, ShoppingBag, Upload } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { exportOrdersWorkbook, getOrder, listOrders, updateOrderStatus } from "@/lib/orders";
import { ApiError } from "@/lib/apiClient";
import type { OrderDetail, OrderListItem, OrderStatus } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewOrderModal } from "./NewOrderModal";
import { ImportOrdersModal } from "./ImportOrdersModal";
import { OrderTable } from "./OrderTable";
import { OrderReceipt } from "./OrderReceipt";

const STATUS_TABS: { label: string; value: OrderStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

export function OrderList() {
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const { t } = useLocale();
  const canManage = role === "admin";
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<OrderDetail | null>(null);

  const {
    data: orders,
    error,
    isLoading,
    mutate,
  } = useSWR(["orders", brand.id, status], () => listOrders({ brandId: brand.id, status: status || null }));

  const q = search.trim().toLowerCase();
  const filtered = (orders ?? []).filter((order: OrderListItem) => {
    if (!q) return true;
    return [order.orderNumber, order.customerName ?? "", order.customerPhone ?? ""].join(" ").toLowerCase().includes(q);
  });

  const isTrueEmpty = !isLoading && !error && (orders?.length ?? 0) === 0 && status === "" && q === "";

  async function handleChangeStatus(orderId: string, nextStatus: OrderStatus) {
    setUpdatingStatusId(orderId);
    try {
      await updateOrderStatus(orderId, nextStatus);
      toast.success(t("Order status updated"));
      void mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order status");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportOrdersWorkbook(brand.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${brand.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to export orders");
    } finally {
      setExporting(false);
    }
  }

  async function handlePrint(order: OrderListItem) {
    setPrintingId(order.id);
    try {
      const detail = await getOrder(order.id);
      setPrintOrder(detail);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load order for printing");
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-slate-900 sm:shrink-0 dark:text-slate-100">{t("Orders")}</h1>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search by Order ID, Customer, or Phone")}
            className="ps-8"
          />
        </div>

        <Button variant="outline" onClick={() => void handleExport()} disabled={exporting} className="sm:shrink-0">
          <Download className="size-4" />
          {exporting ? t("Exporting...") : t("Export Excel")}
        </Button>

        {canManage ? (
          <Button variant="outline" onClick={() => setImportOpen(true)} className="sm:shrink-0">
            <Upload className="size-4" />
            {t("Import Excel")}
          </Button>
        ) : null}

        <Button onClick={() => setNewOrderOpen(true)} className="sm:shrink-0">
          <Plus className="size-4" />
          {t("New Order")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading orders..." />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("Couldn't load orders")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {error instanceof ApiError ? error.message : t("Check that the backend API is running.")}
          </p>
        </div>
      ) : isTrueEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
            <ShoppingBag className="size-7" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("No orders created yet")}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("Orders placed here or via the API will show up in this list.")}
            </p>
          </div>
          <Button onClick={() => setNewOrderOpen(true)} className="mt-1">
            <Plus className="size-4" />
            {t("Create Order")}
          </Button>
        </div>
      ) : (
        <OrderTable
          orders={filtered}
          brandCode={brand.code}
          search={search}
          statusFilter={status}
          onChangeStatus={(orderId, next) => void handleChangeStatus(orderId, next)}
          updatingStatusId={updatingStatusId}
          onPrint={(order) => void handlePrint(order)}
          printingId={printingId}
        />
      )}

      <NewOrderModal
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        brandId={brand.id}
        onSuccess={() => void mutate()}
      />

      <ImportOrdersModal open={importOpen} onOpenChange={setImportOpen} brandId={brand.id} onSuccess={() => void mutate()} />

      {printOrder ? <OrderReceipt order={printOrder} onClose={() => setPrintOrder(null)} /> : null}
    </div>
  );
}
