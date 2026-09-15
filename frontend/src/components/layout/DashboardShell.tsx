import type { ReactNode } from "react";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar } from "./Sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        {/* min-w-0: a flex item's default min-width is its content's intrinsic
            width, so without this, any wide child (a table, a long nowrap
            row) forces `main` — and the whole page — to overflow
            horizontally instead of scrolling within its own container.
            pb-20 reserves space for the fixed mobile bottom nav so content
            isn't hidden behind it. */}
        <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-6 md:pb-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
