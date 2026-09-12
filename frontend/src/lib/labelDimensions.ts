/**
 * Single source of truth for the physical thermal sticker size (a portrait
 * 40mm x 30mm direct-thermal label, per the Xprinter roll this ships on).
 *
 * The @page rule in globals.css can't reference these (CSS @page "size"
 * doesn't resolve custom properties in any shipping browser), so that mm
 * literal must be kept in sync with these two numbers by hand.
 */
export const LABEL_WIDTH_MM = 40;
export const LABEL_HEIGHT_MM = 30;
