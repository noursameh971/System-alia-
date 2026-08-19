"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { isRtl } = useLocale();
  const pageNumbers = getPageWindow(page, totalPages);

  // The flex row itself mirrors under `dir="rtl"`, but the glyphs don't —
  // a left-pointing chevron would end up on the right edge pointing *away*
  // from the earlier pages. Swap them so "previous" always points back
  // along the reading direction.
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <PrevIcon className="size-4" />
      </Button>

      {pageNumbers.map((entry, i) =>
        entry === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-slate-400 dark:text-slate-500">
            …
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === page ? "default" : "outline"}
            size="icon"
            onClick={() => onPageChange(entry)}
          >
            {entry}
          </Button>
        ),
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <NextIcon className="size-4" />
      </Button>
    </div>
  );
}

function getPageWindow(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis");
    result.push(p);
    prev = p;
  }
  return result;
}
