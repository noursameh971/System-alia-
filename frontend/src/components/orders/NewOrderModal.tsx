"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/apiClient";
import { listProducts } from "@/lib/products";
import { createOrder } from "@/lib/orders";
import { formatPrice } from "@/lib/formatPrice";
import { useVariantStock } from "@/hooks/useVariantStock";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { CreatedOrder, OrderPaymentMethod } from "@/lib/types";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";

interface CartLine {
  key: string;
  variantId: string;
  binId: string;
  sku: string;
  productName: string;
  imageUrl: string | null;
  attributesLabel: string;
  binLabel: string;
  unitPrice: number;
  unitCost: number;
  currency: string | null;
  quantity: number;
  availableQty: number;
}

let lineKeySeq = 0;

export function NewOrderModal({
  open,
  onOpenChange,
  brandId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSuccess: (order: CreatedOrder) => void;
}) {
  const { data: products } = useSWR(["products", brandId], () => listProducts(brandId), {
    revalidateOnFocus: false,
  });
  const { role } = useCurrentUser();
  const isAdmin = role === "admin";

  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("cod");
  const [shippingFee, setShippingFee] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products?.find((p) => p.id === productId) ?? null;
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === variantId) ?? null;
  const { stock, isLoading: stockLoading } = useVariantStock(variantId || null);
  const stockedBins = stock.filter((row) => row.quantity > 0);
  const selectedBin = stockedBins.find((row) => row.binId === binId) ?? null;

  function resetPicker() {
    setVariantId("");
    setBinId("");
    setQuantity("1");
  }

  function resetForm() {
    setProductId("");
    resetPicker();
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setPaymentMethod("cod");
    setShippingFee("0");
  }

  function handleAddToCart() {
    if (!selectedProduct || !selectedVariant) {
      toast.error("Select a product and variant first");
      return;
    }
    if (selectedVariant.price == null) {
      toast.error("This variant has no price set");
      return;
    }
    if (!selectedBin) {
      toast.error("Select a bin to fulfill this item from");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("Enter a whole quantity greater than 0");
      return;
    }
    if (qty > selectedBin.quantity) {
      toast.error(`Only ${selectedBin.quantity} in stock in ${selectedBin.zoneCode}/${selectedBin.binCode}`);
      return;
    }

    const attributesLabel = selectedVariant.attributes.map((a) => a.value).join(" / ") || selectedVariant.sku;
    const binLabel = `${selectedBin.zoneCode} / ${selectedBin.binCode}`;

    setCart((prev) => {
      const existingIndex = prev.findIndex((l) => l.variantId === selectedVariant.id && l.binId === selectedBin.binId);
      if (existingIndex >= 0) {
        const next = [...prev];
        const existing = next[existingIndex]!;
        const nextQty = Math.min(existing.quantity + qty, existing.availableQty);
        next[existingIndex] = { ...existing, quantity: nextQty };
        return next;
      }
      lineKeySeq += 1;
      return [
        ...prev,
        {
          key: `line-${lineKeySeq}`,
          variantId: selectedVariant.id,
          binId: selectedBin.binId,
          sku: selectedVariant.sku,
          productName: selectedProduct.name,
          imageUrl: selectedProduct.imageUrl,
          attributesLabel,
          binLabel,
          unitPrice: selectedVariant.price!,
          unitCost: selectedVariant.cost ?? 0,
          currency: selectedVariant.currency,
          quantity: qty,
          availableQty: selectedBin.quantity,
        },
      ];
    });
    resetPicker();
  }

  function updateLineQuantity(key: string, nextQty: number) {
    setCart((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, quantity: Math.max(1, Math.min(nextQty, line.availableQty)) } : line,
      ),
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
  }

  const itemsTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const itemsCost = cart.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const shippingFeeValue = Number(shippingFee) || 0;
  const grandTotal = itemsTotal + shippingFeeValue;
  const estimatedProfit = itemsTotal - (itemsCost + shippingFeeValue);

  async function handleSubmit() {
    if (cart.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        brandId,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        paymentMethod,
        shippingFee: shippingFeeValue,
        items: cart.map((line) => ({ variantId: line.variantId, binId: line.binId, quantity: line.quantity })),
      });
      toast.success(`Order ${order.orderNumber} created`);
      onSuccess(order);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
          <DialogDescription>
            Pick products and variants from stock, add shipping details, and submit — the ordered quantities are
            deducted from inventory immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Add item</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_2fr_1fr]">
              <Select
                aria-label="Product"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  resetPicker();
                }}
                disabled={submitting}
              >
                <option value="">Select product...</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Variant"
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setBinId("");
                }}
                disabled={submitting || !selectedProduct}
              >
                <option value="">Select color/size...</option>
                {(selectedProduct?.variants ?? []).map((v) => (
                  <option key={v.id} value={v.id} disabled={v.price == null || v.stock === 0}>
                    {(v.attributes.map((a) => a.value).join(" / ") || v.sku) +
                      (v.price == null ? " — no price" : v.stock === 0 ? " — out of stock" : ` — ${v.stock} in stock`)}
                  </option>
                ))}
              </Select>

              <Input
                type="number"
                min={1}
                step={1}
                aria-label="Quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={submitting}
              />
            </div>

            {selectedVariant ? (
              stockLoading ? (
                <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">Checking bin stock...</p>
              ) : stockedBins.length === 0 ? (
                <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  No stock recorded for this variant in any bin.
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                  <div className="min-w-[10rem] flex-1">
                    <Label className="mb-1 block text-xs">Bin</Label>
                    <Select aria-label="Bin" value={binId} onChange={(e) => setBinId(e.target.value)} disabled={submitting}>
                      <option value="">Select bin...</option>
                      {stockedBins.map((b) => (
                        <option key={b.binId} value={b.binId}>
                          {b.zoneCode} / {b.binCode} — {b.quantity} in stock
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="button" size="sm" onClick={handleAddToCart} disabled={submitting}>
                    <Plus className="size-3.5" />
                    Add to order
                  </Button>
                </div>
              )
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Items in this order</Label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {cart.length} line{cart.length === 1 ? "" : "s"}
              </span>
            </div>
            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No items added yet
              </p>
            ) : (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pe-1">
                {cart.map((line) => (
                  <div
                    key={line.key}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
                  >
                    <ProductThumbnail imageUrl={line.imageUrl} name={line.productName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {line.productName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {line.attributesLabel} · {line.binLabel}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={line.availableQty}
                      step={1}
                      aria-label={`Quantity for ${line.productName}`}
                      value={line.quantity}
                      onChange={(e) => updateLineQuantity(line.key, Number(e.target.value) || 1)}
                      disabled={submitting}
                      className="w-16 shrink-0"
                    />
                    <span className="w-24 shrink-0 text-end text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatPrice(line.unitPrice * line.quantity, line.currency)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={submitting}
                      aria-label="Remove item"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-order-customer-name">Customer name</Label>
              <Input
                id="new-order-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-order-customer-phone">Phone</Label>
              <Input
                id="new-order-customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-order-customer-address">Address</Label>
              <Input
                id="new-order-customer-address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div>
              <Label className="mb-1.5 block">Payment method</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cod")}
                  disabled={submitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    paymentMethod === "cod"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Cash on Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("online")}
                  disabled={submitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    paymentMethod === "online"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Online Payment
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-order-shipping-fee">Shipping fee</Label>
              <Input
                id="new-order-shipping-fee"
                type="number"
                min={0}
                step="0.01"
                value={shippingFee}
                onChange={(e) => setShippingFee(e.target.value)}
                disabled={submitting}
                className="w-28"
              />
            </div>

            <div className="ml-auto text-end">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Items {formatPrice(itemsTotal)} + Shipping {formatPrice(shippingFeeValue)}
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPrice(grandTotal)}</p>
              {isAdmin && cart.length > 0 ? (
                <p
                  className={`text-xs font-medium ${
                    estimatedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  Est. profit {formatPrice(estimatedProfit)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || cart.length === 0}>
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
