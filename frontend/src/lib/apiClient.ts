import { getAuthHeaders } from "./auth";
import { API_BASE_URL } from "./env";

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string; details?: unknown };
}

/** Calls the backend and unwraps its {success, data} / {success:false, error} envelope. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });

  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? ((await res.json().catch(() => null)) as ApiEnvelope<T> | null) : null;

  if (!res.ok || !body?.success) {
    // A 2xx response with a non-JSON body (most often HTML) almost always
    // means this request never reached the API at all — see env.ts's
    // NEXT_PUBLIC_API_URL check for the most common cause (a relative
    // fetch("" + path) landing back on this very Next.js app, e.g.
    // redirected to /login by proxy.ts, instead of the backend).
    const message =
      body?.error?.message ??
      (res.ok && !isJson
        ? `Got a non-JSON response from ${API_BASE_URL} — check NEXT_PUBLIC_API_URL is set to the live backend's URL`
        : `Request failed with status ${res.status}`);
    throw new ApiError(message, res.status, body?.error?.details);
  }

  return body.data as T;
}

/** Like apiFetch, but for endpoints that return a raw binary body (e.g. the QR PNG) instead of the JSON envelope. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...getAuthHeaders() },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiEnvelope<never> | null;
    throw new ApiError(body?.error?.message ?? `Request failed with status ${res.status}`, res.status, body?.error?.details);
  }

  return res.blob();
}

/** Like apiFetch, but POSTs a file's raw bytes (e.g. the Excel import) instead of a JSON body. Still expects the usual {success, data} JSON envelope back. */
export async function apiFetchUpload<T>(path: string, file: File): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      ...getAuthHeaders(),
    },
    body: file,
  });

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !body?.success) {
    throw new ApiError(body?.error?.message ?? `Request failed with status ${res.status}`, res.status, body?.error?.details);
  }

  return body.data as T;
}
