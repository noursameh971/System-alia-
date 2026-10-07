"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { uploadAssistantAttachment, type AssistantAttachment } from "@/lib/assistant";
import { isReceiptFileType, MAX_ORIGINAL_IMAGE_BYTES, MAX_RECEIPT_BYTES, prepareReceiptFile } from "@/lib/receiptImage";

/** Matches the server's per-message cap (MAX_ATTACHMENTS_PER_MESSAGE). */
export const MAX_ATTACHMENTS = 3;

export interface PendingAttachment {
  key: string;
  fileName: string;
  contentType: string;
  /** A local object URL for images, so the preview shows before the upload finishes. */
  previewUrl: string | null;
  status: "uploading" | "ready" | "failed";
  /** Set once uploaded — including what the receipt reader read from it. */
  attachment: AssistantAttachment | null;
  /** Why the upload itself failed (an unreadable-but-stored file is "ready", with attachment.extractionError). */
  error: string | null;
}

let nextKey = 0;

/**
 * The receipts waiting to go with the next message. Each file is uploaded
 * (and read by the server) as soon as it's added, so by the time the admin
 * presses Send the reading is usually done.
 *
 * Error messages are English source strings for t().
 */
export function useReceiptAttachments({ onRejected }: { onRejected: (message: string) => void }) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const uploads = useRef(new Map<string, AbortController>());
  // The latest items, for add()'s room check and the unmount cleanup.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const update = useCallback((key: string, patch: Partial<PendingAttachment>) => {
    setItems((previous) => previous.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const add = useCallback(
    (files: File[]) => {
      let room = MAX_ATTACHMENTS - itemsRef.current.length;
      for (const original of files) {
        if (!isReceiptFileType(original.type)) {
          onRejected("Attach a JPEG, PNG or WEBP image, or a PDF");
          continue;
        }
        if (original.size > (original.type === "application/pdf" ? MAX_RECEIPT_BYTES : MAX_ORIGINAL_IMAGE_BYTES)) {
          onRejected("File must be 8MB or smaller");
          continue;
        }
        if (room <= 0) {
          onRejected("You can attach up to 3 files per message");
          break;
        }
        room--;

        const key = `attachment-${++nextKey}`;
        const controller = new AbortController();
        uploads.current.set(key, controller);
        setItems((previous) => [
          ...previous,
          {
            key,
            fileName: original.name,
            contentType: original.type,
            previewUrl: original.type.startsWith("image/") ? URL.createObjectURL(original) : null,
            status: "uploading",
            attachment: null,
            error: null,
          },
        ]);

        void (async () => {
          try {
            const file = await prepareReceiptFile(original);
            if (file.size > MAX_RECEIPT_BYTES) throw new ApiError("File must be 8MB or smaller", 413);
            const attachment = await uploadAssistantAttachment(file, controller.signal);
            update(key, { status: "ready", attachment });
          } catch (err) {
            if (controller.signal.aborted) return;
            update(key, { status: "failed", error: err instanceof ApiError ? err.message : "Couldn't upload this file" });
          } finally {
            uploads.current.delete(key);
          }
        })();
      }
    },
    [onRejected, update],
  );

  const remove = useCallback((key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    setItems((previous) => {
      const item = previous.find((candidate) => candidate.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return previous.filter((candidate) => candidate.key !== key);
    });
  }, []);

  /**
   * Empties the tray. After a send the attachments live on in the chat,
   * shown from their stored URLs, so the local previews can go.
   */
  const clear = useCallback(() => {
    for (const controller of uploads.current.values()) controller.abort();
    uploads.current.clear();
    setItems((previous) => {
      for (const item of previous) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);

  // Release previews and stop uploads if the panel goes away.
  useEffect(
    () => () => {
      for (const controller of uploads.current.values()) controller.abort();
      for (const item of itemsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  return {
    items,
    add,
    remove,
    clear,
    uploading: items.some((item) => item.status === "uploading"),
    ready: items.flatMap((item) => (item.status === "ready" && item.attachment ? [item.attachment] : [])),
  };
}
