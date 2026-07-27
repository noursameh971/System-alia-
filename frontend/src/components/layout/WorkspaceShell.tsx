"use client";

import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { DashboardShell } from "./DashboardShell";

export function WorkspaceShell({ brandCode, children }: { brandCode: string; children: ReactNode }) {
  return (
    <WorkspaceProvider brandCode={brandCode}>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
