"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-36 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100",
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-slate-100 dark:focus:bg-slate-800",
        variant === "destructive" && "text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-950/50",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800", className)}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
