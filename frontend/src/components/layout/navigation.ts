import { CFO_ENABLED } from "@/lib/features";
import type { SessionRole } from "@/lib/routing";

export interface NavItem {
  label: string;
  segment: string;
  /** Roles allowed to see this item. Omitted means every role (admin, warehouse_staff, finance, qr_printer) sees it. */
  roles?: SessionRole[];
  /** False keeps the item out of the mobile bottom bar (sidebar only), so optional modules don't crowd the phone layout. */
  mobile?: boolean;
}

// Relative to /[brand]/ — Sidebar/MobileBottomNav prefix these with the
// active workspace's brand code, so the same list works for any brand.
// finance is intentionally narrower than warehouse_staff: it's a
// single-module role (see proxy.ts's route lock), not a lighter version of
// the operational nav.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", roles: ["admin", "warehouse_staff"] },
  { label: "Products", segment: "products", roles: ["admin", "warehouse_staff", "qr_printer"] },
  { label: "Inventory", segment: "inventory", roles: ["admin", "warehouse_staff"] },
  { label: "Orders", segment: "orders", roles: ["admin", "warehouse_staff"] },
  { label: "Finance", segment: "finance", roles: ["admin", "finance"] },
  // Optional, self-contained module — see lib/features.ts.
  ...(CFO_ENABLED ? [{ label: "Virtual CFO", segment: "cfo", roles: ["admin", "finance"] as SessionRole[], mobile: false }] : []),
  { label: "Settings", segment: "settings", roles: ["admin"] },
];

export function buildNavHref(brandCode: string, segment: string): string {
  return `/${brandCode.toLowerCase()}/${segment}`;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
