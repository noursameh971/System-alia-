/**
 * Phone photos of receipts are often 3–6MB at 4000px — far more than is
 * needed to read one, slow to upload, and over the receipt reader's 4MB
 * limit for an inline image. Big images are scaled down here, in the
 * browser, before upload. Small ones (most screenshots) go up untouched.
 */

/** Long edge after scaling — small print stays legible, and the reader's token cost stays modest. */
const MAX_EDGE = 1800;
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;

export const RECEIPT_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
/** The server's limit, for what's actually uploaded. */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
/** A photo is shrunk before upload, so a big original is fine — this only stops absurd files being decoded at all. */
export const MAX_ORIGINAL_IMAGE_BYTES = 25 * 1024 * 1024;

export function isReceiptFileType(type: string): boolean {
  return (RECEIPT_FILE_TYPES as readonly string[]).includes(type);
}

export async function prepareReceiptFile(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so a sideways phone shot comes out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // Not decodable here — let the server decide what it is.
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= RESIZE_ABOVE_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: a transparent PNG would otherwise turn black behind the text.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
