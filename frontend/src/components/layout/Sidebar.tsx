"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InventoryIcon, OrdersIcon, ProductsIcon } from "./icons";
import { NAV_ITEMS, isNavItemActive } from "./navigation";

const ICONS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  "/products": ProductsIcon,
  "/inventory": InventoryIcon,
  "/orders": OrdersIcon,
};

/** Desktop/tablet-landscape navigation. Hidden on narrow screens in favor of MobileBottomNav. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col dark:border-slate-800 dark:bg-slate-950">
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.href];
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
