"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";

/** Settings moved to the per-workspace /[brand]/settings route (reachable from the Sidebar) — this route now just forwards any existing bookmarks/links to the workspace picker. */
export default function SettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Redirecting..." />
    </div>
  );
}
