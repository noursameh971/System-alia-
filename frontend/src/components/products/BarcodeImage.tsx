"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders `value` as a Code 128 barcode straight into an inline <svg> via
 * jsbarcode — no server round-trip, so the label can render (and reprint)
 * offline and instantly.
 *
 * jsbarcode sizes the <svg> it draws into with fixed pixel `width`/`height`
 * attributes. Those win over CSS on their own, so a caller sizing this via
 * an mm-based className would get the barcode clipped instead of scaled. We
 * swap them for a `viewBox` right after drawing so the mm-sized box in
 * `className` scales the whole barcode down (via `preserveAspectRatio`)
 * instead of cropping it.
 */
export function BarcodeImage({ value, className }: { value: string; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 100,
        width: 2,
      });
      const width = svg.getAttribute("width");
      const height = svg.getAttribute("height");
      if (width && height) {
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
      }
    } catch {
      // SKU has a character CODE128 can't encode — shouldn't happen for our
      // generated SKUs, but fail quiet (blank barcode) rather than crash the
      // whole label/print view over one bad variant.
    }
  }, [value]);

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={`Barcode for ${value}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    />
  );
}
