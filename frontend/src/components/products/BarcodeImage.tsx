"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// jsbarcode's width/height options are CSS reference pixels (96 per inch)
// once this SVG stops being CSS-rescaled — see the effect below for why
// that matters. Chosen generously thick for thermal printing: 2.5px =
// 0.026in/module ≈ 5.3 dots at 203 DPI, 7.8 at 300 DPI, well clear of the
// ~2 dots/module floor where a real print head's heat bleed starts merging
// adjacent bars (the same physics that broke the original SKU-length
// payload — see qrcode.util.ts — except this time the fix is bar width,
// not data length, since the payload is already short).
const MODULE_WIDTH_PX = 2.5;
// AIM/GS1's Code128 spec: minimum quiet zone is 10x the module width.
// Deriving this from MODULE_WIDTH_PX (not a fixed literal) keeps the two in
// spec with each other if the module width above is ever retuned.
const QUIET_ZONE_PX = MODULE_WIDTH_PX * 10;
// Taller bars tolerate an imperfect scan angle better than short ones.
const BAR_HEIGHT_PX = 60;

/**
 * Renders `value` as a Code 128 barcode straight into an inline <svg> via
 * jsbarcode — no server round-trip, so the label can render (and reprint)
 * offline and instantly.
 *
 * Renders at a fixed, explicit *physical* size (module width chosen above)
 * rather than letting CSS stretch/shrink the SVG to fit whatever box a
 * caller gives it. That's a deliberate change from sizing this via
 * `className`/`style` + `preserveAspectRatio`: a CSS rescale applies an
 * arbitrary, box-size-and-data-length-dependent scale factor to the whole
 * vector, which can land bar edges at fractional, non-dot-aligned
 * positions. A screen has enough resolution and anti-aliasing headroom
 * that this is invisible — the barcode still looks (and decodes) fine on
 * screen and in a PDF. A thermal print head doesn't: it has no
 * anti-aliasing, only a fixed grid of dots either burned or not, so the
 * rasterizer has to snap every edge to that grid — and an arbitrary scale
 * factor means bars of genuinely different module counts (Code128 mixes
 * 1x-4x-wide bars) can snap to the *same* rounded dot width, which is
 * exactly the width *ratio* a Code128 decoder reads the data from.
 * Rendering 1:1 at a size chosen up front removes that whole failure mode:
 * the vector geometry already *is* the intended physical size, so there's
 * no second, uncontrolled scale step left to introduce rounding error.
 *
 * This is why a barcode can scan perfectly at full size on a monitor, and
 * still fail the instant it's printed at sticker size — the exact symptom
 * this was written to fix.
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
        marginLeft: QUIET_ZONE_PX,
        marginRight: QUIET_ZONE_PX,
        height: BAR_HEIGHT_PX,
        width: MODULE_WIDTH_PX,
      });

      // jsbarcode sets these WITH a "px" suffix (e.g. "220px"); parseFloat
      // strips it to the bare number viewBox requires (see below).
      const widthPx = parseFloat(svg.getAttribute("width") ?? "");
      const heightPx = parseFloat(svg.getAttribute("height") ?? "");
      if (widthPx && heightPx) {
        svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
        // The 1:1 physical size itself — see the component doc comment.
        // 96 CSS reference px per inch is the standard conversion; this is
        // what makes MODULE_WIDTH_PX/BAR_HEIGHT_PX above true physical
        // sizes rather than arbitrary drawing units.
        svg.style.width = `${widthPx / 96}in`;
        svg.style.height = `${heightPx / 96}in`;
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
