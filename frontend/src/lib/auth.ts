import { apiFetch } from "./apiClient";

const SESSION_COOKIE = "alia_session";

export type UserRole = "admin" | "warehouse_staff";

export interface Session {
  sub: string;
  role: UserRole;
  /** Assigned workspace, lowercased (e.g. "alh"). Null for admins. */
  brandCode: string | null;
  brandId: string | null;
  /** Unix seconds, from the JWT's `exp` claim. */
  exp: number;
}

interface LoginResponseUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  brandCode: string | null;
  brandId: string | null;
}

interface LoginResponse {
  token: string;
  user: LoginResponseUser;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
}

/**
 * Reads the JWT's payload without verifying its signature. That's fine here:
 * this is a display/UI-gating convenience only (which nav links to show,
 * which brand a form should default to). The two places that actually
 * enforce anything — proxy.ts and every backend route's requireAuth —
 * verify the signature with JWT_SECRET before trusting a single claim.
 */
function decodeToken(token: string): Session | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(base64UrlDecode(payload)) as Session;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * NOT httpOnly — a deliberate tradeoff. The frontend calls the Express API
 * directly from the browser (see apiClient.ts), so it needs to read the raw
 * token to send `Authorization: Bearer <token>`; an httpOnly cookie can't be
 * read by that fetch call. The same cookie doubles as what proxy.ts
 * reads (edge-side, signature-verified) to gate routes. This means an XSS
 * bug could exfiltrate the token, same as any token kept in JS-reachable
 * storage — mitigate with CSP and a short JWT_EXPIRES_IN, or harden later by
 * proxying all API calls through Next.js route handlers and switching this
 * to a true httpOnly cookie.
 */
function writeSessionCookie(token: string): void {
  const session = decodeToken(token);
  const maxAge = session ? Math.max(1, session.exp - Math.floor(Date.now() / 1000)) : 60 * 60 * 8;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export function getToken(): string | null {
  return readCookie(SESSION_COOKIE);
}

export function getSession(): Session | null {
  const token = getToken();
  return token ? decodeToken(token) : null;
}

/** The one place the frontend reaches into token storage — everything else calls apiFetch/apiFetchBlob. */
export function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email: string, password: string): Promise<LoginResponseUser> {
  const { token, user } = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  writeSessionCookie(token);
  return user;
}

export function logout(): void {
  clearSessionCookie();
}
