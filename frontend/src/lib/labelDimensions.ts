/**
 * Single source of truth for the physical thermal sticker size — a 4in x
 * 2in direct-thermal label, printed landscape (see labelPrintStyle.ts).
 * Genuinely the only place these two numbers live: the sticker's own box
 * (BarcodeStickerLabel) and the print-time `@page` rule (labelPrintStyle.ts)
 * both read these constants directly rather than duplicating the literal.
 */
export const LABEL_WIDTH_IN = 4;
export const LABEL_HEIGHT_IN = 2;
