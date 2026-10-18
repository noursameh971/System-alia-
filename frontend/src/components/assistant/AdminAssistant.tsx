"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { listBrands } from "@/lib/brands";
import { ASSISTANT_ENABLED } from "@/lib/features";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistantChat } from "./useAssistantChat";

/**
 * The admin assistant's entry point, mounted once in the root layout so it's
 * on every page: a floating button plus Ctrl/⌘+K. Renders nothing for any
 * other role — the server refuses them regardless (assistant.routes.ts).
 *
 * Also renders nothing while ASSISTANT_ENABLED is off (lib/features.ts): the
 * Ctrl/⌘+K listener lives in AssistantLauncher, so it isn't registered either.
 */
export function AdminAssistant() {
  const { role, isLoading } = useCurrentUser();
  if (!ASSISTANT_ENABLED || isLoading || role !== "admin") return null;
  return <AssistantLauncher />;
}

function AssistantLauncher() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const chat = useAssistantChat();
  const pathname = usePathname();
  // Same SWR key WorkspaceProvider uses, so this shares its cached list.
  const { data: brands = [] } = useSWR("brands", listBrands, { revalidateOnFocus: false });

  // Mounted above the [brand] layout, so the active workspace comes from the
  // URL rather than WorkspaceContext: /alh/finance → ALH; /dashboard,
  // /factory, /settings → none (the assistant then asks which brand).
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  const activeBrand = brands.find((brand) => brand.code.toLowerCase() === firstSegment) ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Open assistant")}
          title={`${t("Assistant")} (Ctrl/⌘+K)`}
          // bottom-24 on phones clears the fixed MobileBottomNav.
          className="fixed bottom-24 end-4 z-30 flex size-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 md:bottom-6 dark:bg-slate-100 dark:text-slate-900"
        >
          <Sparkles className="size-5" />
        </button>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="max-w-lg gap-0 p-0">
          <AssistantPanel chat={chat} activeBrand={activeBrand} brands={brands} open={open} />
        </SheetContent>
      </Sheet>
    </>
  );
}
