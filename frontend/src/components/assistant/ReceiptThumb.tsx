"use client";

import { FileText } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { resolveImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * A receipt's preview — the image itself, or a PDF tile — opening the full
 * file in a new tab. Shared by the input's attachment chips, the admin's
 * message bubbles and the draft cards, so the admin can always check a
 * number against the document it came from.
 */
export function ReceiptThumb({
  url,
  previewUrl,
  contentType,
  fileName,
  className,
}: {
  /** The stored file (a /uploads/receipts path). Null while it's still uploading. */
  url: string | null;
  /** A local object URL, shown until (or instead of) the stored one. */
  previewUrl?: string | null;
  contentType: string;
  fileName?: string | null;
  className?: string;
}) {
  const { t } = useLocale();
  const href = url ? resolveImageUrl(url) : null;
  const isPdf = contentType === "application/pdf";
  const src = previewUrl ?? href;
  const label = fileName ? `${t("Open receipt")}: ${fileName}` : t("Open receipt");

  const body =
    isPdf || !src ? (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <FileText className="size-5" aria-hidden />
        <span className="text-[9px] font-semibold uppercase">{isPdf ? "PDF" : ""}</span>
      </span>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- an uploaded file or a local blob URL; next/image can't optimize either
      <img src={src} alt="" className="h-full w-full object-contain" />
    );

  const frame = cn(
    "block shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    className,
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(frame, "hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600")} title={label} aria-label={label}>
      {body}
    </a>
  ) : (
    <span className={frame}>{body}</span>
  );
}
