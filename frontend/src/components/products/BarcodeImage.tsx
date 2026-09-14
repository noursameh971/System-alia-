"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders `value` as a Code 128 barcode straight into an inline <svg> via
 * jsbarcode — no server round-trip, so the label can render (and reprint)
 * offline and instantly.
 *
 * jsbarcode sizes the <svg> it draws into with fixed pixel `width`/`height`
 * attributes. Those win over CSS on their own, so a caller sizing this via
 * an in-based className would get the barcode clipped instead of scaled. We
 * swap them for a `viewBox` right after drawing so the sticker's own box
 * (BarcodeStickerLabel) scales the whole barcode down (via
 * `preserveAspectRatio`) instead of cropping it — see the parseFloat note
 * below for a real bug this used to hide.
 */
export function BarcodeImage({
  value,
  className,
  style,
}: {
  value: string;
  className?: string;
  style?: CSSProperties;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: false,
        // Quiet zone: the blank space on either side of the bars a
        // scanner needs to detect where the barcode starts/stops — not
        // decoration, a hard requirement. AIM/GS1's Code128 spec sets the
        // minimum at 10x the narrow-bar (module) width; at width:2 that's
        // 20. margin:0 previously zeroed this out entirely (a leftover
        // space-saving choice from the old, much smaller label format),
        // which is a complete scan failure, not a misread — there's
        // nothing for the scanner to lock onto. Top/bottom stay 0: only
        // the horizontal quiet zone matters for a 1D barcode, and this
        // label's height is tightly budgeted (see BarcodeStickerLabel).
        margin: 0,
        marginLeft: 20,
        marginRight: 20,
        height: 100,
        width: 2,
      });
      // jsbarcode sets these WITH a "px" suffix (e.g. "858px"), but the
      // viewBox attribute requires four bare, unitless numbers per the SVG
      // spec — `viewBox="0 0 858px 100px"` is invalid syntax. parseFloat
      // strips the suffix; passing the raw string through here previously
      // produced an invalid viewBox, which made Chrome fall back to
      // treating the drawing commands' 858x100 coordinate space as raw
      // CSS pixels instead of scaling it to fit the sticker's box —
      // clipping off however much of the barcode (often the right half)
      // fell outside the box's actual rendered width. That's a real
      // barcode, printed with real missing bars: not a scanner problem.
      const width = parseFloat(svg.getAttribute("width") ?? "");
      const height = parseFloat(svg.getAttribute("height") ?? "");
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
      style={style}
    />
  );
}
