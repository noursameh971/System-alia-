"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { InventoryIcon, OrdersIcon, ProductsIcon } from "./icons";
import { NAV_ITEMS, buildNavHref, isNavItemActive } from "./navigation";

const ICONS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  products: ProductsIcon,
  inventory: InventoryIcon,
  orders: OrdersIcon,
};

/**
 * Bottom tab bar for phones/tablets — thumb-reachable, which matters more
 * than a hamburger drawer for staff walking the warehouse floor with a
 * device in one hand.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { brand } = useWorkspace();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 backdrop-blur
        md:hidden dark:border-slate-800 dark:bg-slate-950/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.segment];
        const href = buildNavHref(brand.code, item.segment);
        const active = isNavItemActive(pathname, href);
        return (
          <Link
            key={item.segment}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
              active ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {Icon ? <Icon className="h-5 w-5" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
