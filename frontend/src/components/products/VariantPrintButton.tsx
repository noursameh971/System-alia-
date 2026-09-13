"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearLabelPrintPageStyle, setLabelPrintPageStyle } from "@/lib/labelPrintStyle";
import { LabelPrintPortal } from "./LabelPrintPortal";
import { BarcodeStickerLabel, type StickerVariant } from "./BarcodeStickerLabel";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * One click, straight to the browser's print dialog for this variant's
 * thermal sticker — no preview modal/popover in between. The sticker
 * markup is portaled to a dedicated print-only root under <body> (see
 * LabelPrintPortal), which stays display:none until @media print, so
 * nothing is ever shown as a popup on screen.
 */
export function VariantPrintButton({ variant }: { variant: StickerVariant }) {
  const [printing, setPrinting] = useState(false);

  async function handleClick() {
    setPrinting(true);
    // Let the now-visible-in-print-media sticker (barcode SVG included)
    // actually paint before invoking print — calling print() immediately
    // after a state update can otherwise capture a stale (pre-render) layout.
    await nextFrame();
    setLabelPrintPageStyle();
    window.print();

    const cleanup = () => {
      clearLabelPrintPageStyle();
      setPrinting(false);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleClick()}
        aria-label={`Print barcode label for ${variant.sku}`}
      >
        <Printer className="size-4" />
      </Button>
      {printing ? (
        <LabelPrintPortal>
          <BarcodeStickerLabel variant={variant} />
        </LabelPrintPortal>
      ) : null}
    </>
  );
}
