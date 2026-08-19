"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, TrendingUp } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { DashboardIcon, InventoryIcon, OrdersIcon, ProductsIcon } from "./icons";
import { NAV_ITEMS, buildNavHref, isNavItemActive } from "./navigation";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: DashboardIcon,
  products: ProductsIcon,
  inventory: InventoryIcon,
  orders: OrdersIcon,
  finance: TrendingUp,
  settings: Settings,
};

/** Desktop/tablet-landscape navigation. Hidden on narrow screens in favor of MobileBottomNav. border-e (not border-r) so the divider stays on the edge next to the main content when the sidebar visually flips sides in RTL. */
export function Sidebar() {
  const pathname = usePathname();
  const { brand } = useWorkspace();
  const { role } = useCurrentUser();
  const { t } = useLocale();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

  return (
    <aside className="hidden w-56 shrink-0 border-e border-slate-200 bg-white md:flex md:flex-col dark:border-slate-800 dark:bg-slate-950">
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {items.map((item) => {
          const Icon = ICONS[item.segment];
          const href = buildNavHref(brand.code, item.segment);
          const active = isNavItemActive(pathname, href);
          return (
            <Link
              key={item.segment}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
