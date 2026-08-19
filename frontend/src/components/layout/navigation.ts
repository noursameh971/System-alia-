export interface NavItem {
  label: string;
  segment: string;
  /** Hidden from the nav entirely for warehouse_staff — Finance and Settings both are. */
  adminOnly?: boolean;
}

// Relative to /[brand]/ — Sidebar/MobileBottomNav prefix these with the
// active workspace's brand code, so the same list works for any brand.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", segment: "dashboard" },
  { label: "Products", segment: "products" },
  { label: "Inventory", segment: "inventory" },
  { label: "Orders", segment: "orders" },
  { label: "Finance", segment: "finance", adminOnly: true },
  { label: "Settings", segment: "settings", adminOnly: true },
];

export function buildNavHref(brandCode: string, segment: string): string {
  return `/${brandCode.toLowerCase()}/${segment}`;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
