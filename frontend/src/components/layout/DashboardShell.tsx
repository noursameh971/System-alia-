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
        {/* pb-20 reserves space for the fixed mobile bottom nav so content isn't hidden behind it */}
        <main className="flex-1 px-4 pb-20 pt-6 sm:px-6 md:pb-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
