import { apiFetchUpload } from "./apiClient";

export interface UploadedFileResult {
  url: string;
}

/** Backs the receipt/invoice file uploader shared by the Add Expense and Add Opening Balance modals — the file's raw bytes, not JSON. Standalone (no owning expense/transaction row yet): returns a URL the caller stores in its own form state, the same way a hand-typed receipt URL always worked. */
export function uploadReceiptFile(file: File): Promise<UploadedFileResult> {
  return apiFetchUpload<UploadedFileResult>("/api/uploads/receipts", file);
}
