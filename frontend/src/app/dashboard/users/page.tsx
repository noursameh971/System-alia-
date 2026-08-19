"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";

/** User Management moved into the per-workspace Settings page ("User Management" tab, under /[brand]/settings) — this route now just forwards any existing bookmarks/links to the workspace picker. */
export default function UsersRedirectPage() {
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
