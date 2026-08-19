"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Printer } from "lucide-react";
import type { OrderListItem, OrderStatus } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/formatPrice";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentMethodBadge } from "./PaymentMethodBadge";

const STATUS_OPTIONS: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];
const PAGE_SIZE = 15;

interface OrderTableProps {
  orders: OrderListItem[];
  brandCode: string;
  search: string;
  statusFilter: OrderStatus | "";
  onChangeStatus: (orderId: string, status: OrderStatus) => void;
  updatingStatusId: string | null;
  onPrint: (order: OrderListItem) => void;
  printingId: string | null;
}

export function OrderTable({
  orders,
  brandCode,
  search,
  statusFilter,
  onChangeStatus,
  updatingStatusId,
  onPrint,
  printingId,
}: OrderTableProps) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the search text or status tab changes — a
  // render-time adjustment (not an effect) so the stale page never paints.
  const [prevSearch, setPrevSearch] = useState(search);
  const [prevStatusFilter, setPrevStatusFilter] = useState(statusFilter);
  if (search !== prevSearch || statusFilter !== prevStatusFilter) {
    setPrevSearch(search);
    setPrevStatusFilter(statusFilter);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = useMemo(
    () => orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [orders, currentPage],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="py-3">{t("Order ID")}</TableHead>
            <TableHead className="py-3">{t("Customer")}</TableHead>
            <TableHead className="py-3">{t("Date")}</TableHead>
            <TableHead className="py-3">{t("Items")}</TableHead>
            <TableHead className="py-3">{t("Total")}</TableHead>
            <TableHead className="py-3">{t("Status")}</TableHead>
            <TableHead className="py-3">{t("Payment")}</TableHead>
            <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {search ? `${t("No orders match")} "${search}".` : t("No orders match this filter.")}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="py-3.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                  #{order.orderNumber}
                </TableCell>
                <TableCell className="py-3.5">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {order.customerName ?? <span className="font-normal text-slate-400">{t("No name")}</span>}
                  </p>
                  {order.customerPhone ? (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{order.customerPhone}</p>
                  ) : null}
                </TableCell>
                <TableCell className="py-3.5 text-slate-600 dark:text-slate-400">
                  {new Date(order.orderDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="py-3.5 tabular-nums text-slate-600 dark:text-slate-400">
                  {order.itemCount}
                </TableCell>
                <TableCell className="py-3.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatPrice(order.total + order.shippingFee)}
                </TableCell>
                <TableCell className="py-3.5">
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell className="py-3.5">
                  <PaymentMethodBadge method={order.paymentMethod} />
                </TableCell>
                <TableCell className="py-3.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <Select
                      aria-label={`Change status for ${order.orderNumber}`}
                      value={order.status}
                      onChange={(e) => onChangeStatus(order.id, e.target.value as OrderStatus)}
                      disabled={updatingStatusId === order.id}
                      wrapperClassName="w-32"
                      className="h-8 text-xs"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(s[0]!.toUpperCase() + s.slice(1))}
                        </option>
                      ))}
                    </Select>
                    <Button variant="ghost" size="icon" asChild aria-label="View details" title={t("View details")}>
                      <Link href={`/${brandCode.toLowerCase()}/orders/${order.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onPrint(order)}
                      disabled={printingId === order.id}
                      aria-label="Print invoice"
                      title={t("Print invoice")}
                    >
                      <Printer className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("Showing")} {orders.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
          {Math.min(orders.length, currentPage * PAGE_SIZE)} {t("of")} {orders.length}
        </p>
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
