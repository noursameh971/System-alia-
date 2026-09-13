/**
 * Single source of truth for the physical thermal sticker size (a 40mm x
 * 30mm direct-thermal label, per the Xprinter roll this ships on — printed
 * landscape, see labelPrintStyle.ts). Genuinely the only place these two
 * numbers live: the sticker's own box (BarcodeStickerLabel) and the
 * print-time `@page` rule (labelPrintStyle.ts) both read these constants
 * directly rather than duplicating the literal.
 */
export const LABEL_WIDTH_MM = 40;
export const LABEL_HEIGHT_MM = 30;
