import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-slate-200 dark:[&_tr]:border-slate-800", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "border-t border-slate-200 bg-slate-50/50 font-medium [&>tr]:last:border-b-0 dark:border-slate-800 dark:bg-slate-900/50",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-slate-100 transition-colors hover:bg-slate-50/75 data-[state=selected]:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50 dark:data-[state=selected]:bg-slate-900",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-4 text-start align-middle text-xs font-medium uppercase tracking-wide text-slate-500 [&:has([role=checkbox])]:pe-0 dark:text-slate-400",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-slate-700 [&:has([role=checkbox])]:pe-0 dark:text-slate-300",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-4 text-sm text-slate-500 dark:text-slate-400", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
