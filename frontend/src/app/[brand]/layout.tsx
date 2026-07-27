import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";

// `params` is a Promise on this Next.js version (same convention used for
// app/[brand]/orders/[id]/page.tsx) — awaited here in a Server Component,
// then handed to the Client Component that actually resolves and locks the
// workspace brand.
export default async function BrandLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ brand: string }>;
}) {
  const { brand } = await params;

  return <WorkspaceShell brandCode={brand}>{children}</WorkspaceShell>;
}
