"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
import { fetchVariantQrCodeObjectUrl } from "@/lib/products";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { QrStickerLabel, type StickerVariant } from "./QrStickerLabel";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * One click, straight to the browser's print dialog for this variant's
 * 50mm x 25mm sticker — no preview modal/popover in between. The sticker
 * markup is rendered into an off-screen node (display:none until
 * @media print, via `hidden print:block`) that only becomes visible — and
 * only fills the page — during printing itself, per globals.css's
 * .print-area rules, so nothing is ever shown as a popup on screen.
 */
export function VariantPrintButton({ variant }: { variant: StickerVariant }) {
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const url = await fetchVariantQrCodeObjectUrl(variant.sku);
      setPrintUrl(url);
      // Let the now-visible-in-print-media sticker actually paint before
      // invoking print — calling print() immediately after a state update
      // can otherwise capture a stale (pre-image) layout.
      await nextFrame();
      window.print();

      const cleanup = () => {
        URL.revokeObjectURL(url);
        setPrintUrl(null);
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate QR code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleClick()}
        disabled={loading}
        aria-label={`Print QR label for ${variant.sku}`}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
      </Button>
      {printUrl ? (
        <div className="hidden print:block print-area qr-label-print-area">
          <QrStickerLabel variant={variant} qrUrl={printUrl} />
        </div>
      ) : null}
    </>
  );
}
