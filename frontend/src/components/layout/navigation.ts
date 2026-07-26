export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Products", href: "/products" },
  { label: "Inventory", href: "/inventory" },
  { label: "Orders", href: "/orders" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
