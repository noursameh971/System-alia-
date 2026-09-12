"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PRINT_ROOT_ID = "label-print-root";

function getOrCreatePrintRoot(): HTMLElement {
  let el = document.getElementById(PRINT_ROOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = PRINT_ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Portals its children directly under <body>, outside the whole app shell.
 *
 * Labels used to print via a `.print-area` element hidden in place with
 * `visibility: hidden` + `position: fixed`. On a real thermal printer that
 * broke two ways: (1) `visibility: hidden` still reserves layout space, so
 * whatever dashboard chrome sits above the print node in the DOM — however
 * invisible — still got paged through as blank sheets; (2) `position: fixed`
 * pins its content to a single repeating page box, so a batch of labels
 * (each meant to land on its own physical label page via `break-after-page`)
 * couldn't paginate at all and rendered cropped and at the wrong scale.
 * Portaling to <body> sidesteps both: nothing precedes it, so it flows and
 * paginates like a normal document (see globals.css's `#label-print-root`
 * rules).
 */
export function LabelPrintPortal({ children }: { children: ReactNode }) {
  // Lazy-initialized once per mount, guarded for SSR — document doesn't
  // exist on the server, and getOrCreatePrintRoot is idempotent so this
  // stays safe under React Strict Mode's dev-time double-invocation.
  const [root] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : getOrCreatePrintRoot(),
  );

  if (!root) return null;
  return createPortal(children, root);
}
