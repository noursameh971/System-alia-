import type { ReactNode } from "react";
import { FactoryShell } from "@/components/factory/FactoryShell";

export default function FactoryLayout({ children }: { children: ReactNode }) {
  return <FactoryShell>{children}</FactoryShell>;
}
