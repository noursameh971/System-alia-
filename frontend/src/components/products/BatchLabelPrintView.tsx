"use client";

import { useEffect } from "react";
import { LABEL_HEIGHT_IN, LABEL_WIDTH_IN } from "@/lib/labelDimensions";
import { clearLabelPrintPageStyle, setLabelPrintPageStyle } from "@/lib/labelPrintStyle";
import { LabelPrintPortal } from "./LabelPrintPortal";
import { BarcodeStickerLabel, type StickerVariant } from "./BarcodeStickerLabel";

export type PrintableVariant = StickerVariant;

/**
 * Shows a grid of thermal stickers for on-screen review. The actual print
 * output is a separate copy portaled to a dedicated print-only root under
 * <body> (see LabelPrintPortal), so each sticker breaks cleanly onto its
 * own physical label page instead of fighting the review modal's layout —
 * see globals.css's `#label-print-root` rules.
 */
export function BatchLabelPrintView({ variants, onClose }: { variants: PrintableVariant[]; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Active for the whole review-modal lifetime rather than wrapped tightly
  // around each window.print() call — this modal can be printed zero, one,
  // or several times before closing, and the cleanup only needs to happen
  // once, whenever that is (see labelPrintStyle.ts for why this exists).
  useEffect(() => {
    setLabelPrintPageStyle();
    return () => clearLabelPrintPageStyle();
  }, []);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900/50 print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-xl print:hidden dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Print Labels</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {variants.length} label{variants.length === 1 ? "" : "s"} &middot; {LABEL_WIDTH_IN}in &times;{" "}
              {LABEL_HEIGHT_IN}in thermal stock
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Print
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 rounded-xl bg-white p-4 print:hidden dark:bg-slate-900">
          {variants.map((v) => (
            <BarcodeStickerLabel key={v.sku} variant={v} />
          ))}
        </div>
      </div>

      <LabelPrintPortal>
        {variants.map((v, index) => (
          <BarcodeStickerLabel key={v.sku} variant={v} breakAfter={index < variants.length - 1} />
        ))}
      </LabelPrintPortal>
    </div>
  );
}
