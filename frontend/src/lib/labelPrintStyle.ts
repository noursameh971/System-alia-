import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "./labelDimensions";

const LABEL_PAGE_STYLE_ID = "label-print-page-size";

/**
 * Sets this print's page geometry via a temporary, unnamed `@page` rule
 * injected right before printing and removed right after (see
 * clearLabelPrintPageStyle) — not a named `@page thermal-label { ... }`
 * rule scoped via the `page` property.
 *
 * A *named* page is the textbook CSS Paged Media way to scope a page size
 * to one part of a document without affecting the rest (here, the order
 * receipt, which prints at normal paper size from this same single-page
 * app) — but Chromium's print pipeline has a long, still-partial history of
 * not reliably honoring named pages, which lines up exactly with this
 * feature's history: an @page rule already declared the right size, and
 * printing still needed the browser's Paper size/Orientation picked by hand
 * every time. A plain, unnamed `@page` rule has universal, solid browser
 * support, so this swaps one in only for the moment a label print is
 * actually happening (see the two call sites: VariantPrintButton's
 * print-then-cleanup-on-afterprint, and BatchLabelPrintView's
 * set-on-mount/clear-on-unmount for its whole review-modal lifetime) —
 * the receipt's own, unrelated print action never touches this.
 *
 * Reading LABEL_WIDTH_MM/LABEL_HEIGHT_MM directly (rather than a hand-kept-
 * in-sync literal, which is what a static CSS `@page` rule was stuck with —
 * `size` can't resolve a CSS custom property in any shipping browser) means
 * labelDimensions.ts is genuinely the only place these two numbers live now.
 */
export function setLabelPrintPageStyle(): void {
  if (document.getElementById(LABEL_PAGE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LABEL_PAGE_STYLE_ID;
  style.textContent = `@page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm landscape; margin: 0; }`;
  document.head.appendChild(style);
}

export function clearLabelPrintPageStyle(): void {
  document.getElementById(LABEL_PAGE_STYLE_ID)?.remove();
}
