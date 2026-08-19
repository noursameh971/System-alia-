import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Undo2, Wrench } from "lucide-react";

export type MovementBadgeVariant = "success" | "info" | "orange" | "purple" | "neutral";

export const MOVEMENT_LABEL: Record<string, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  return_in: "Return",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

// Inbound green, Outbound blue, Return orange, Transfer purple — anything
// else (e.g. a plain stock adjustment from the Product Profile drawer) gets
// a neutral gray fallback rather than inventing a 5th color. Shared by the
// Inventory page's Recent Movements Log and the workspace dashboard's
// Recent Activity list so both read the same way.
export const MOVEMENT_BADGE_VARIANT: Record<string, MovementBadgeVariant> = {
  inbound: "success",
  outbound: "info",
  return_in: "orange",
  transfer: "purple",
  adjustment: "neutral",
};

/**
 * Icon + tint per movement type, for the activity feeds' leading badge. The
 * glyph carries the direction (arrow *in* vs arrow *out*) so the row is
 * scannable without reading the label, and the tint reuses the same color
 * family as MOVEMENT_BADGE_VARIANT above so a row's icon and its badge
 * can't disagree.
 */
export const MOVEMENT_ICON: Record<string, LucideIcon> = {
  inbound: ArrowDownLeft,
  outbound: ArrowUpRight,
  return_in: Undo2,
  transfer: ArrowLeftRight,
  adjustment: Wrench,
};

export const MOVEMENT_ICON_CLASS: Record<string, string> = {
  inbound: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  outbound: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  return_in: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  transfer: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  adjustment: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
};

const FALLBACK_ICON_CLASS = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

export function movementIcon(type: string): LucideIcon {
  return MOVEMENT_ICON[type] ?? Wrench;
}

export function movementIconClass(type: string): string {
  return MOVEMENT_ICON_CLASS[type] ?? FALLBACK_ICON_CLASS;
}
