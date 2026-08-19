/**
 * Server-side (edge/Node) JWT session verification — shared by proxy.ts
 * (the route guard) and "/"'s root page (the server-side landing redirect),
 * so there's exactly one place that decides what a verified session looks
 * like. Not for Client Components: see lib/auth.ts's getSession() for the
 * unverified, UI-convenience read of the same cookie (decodes but doesn't
 * check the signature — fine for "which nav link to show", not for access
 * control).
 */
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "alia_session";

export interface SessionPayload {
  sub: string;
  role: "admin" | "warehouse_staff";
  brandCode: string | null;
}

/** Verifies a raw JWT string against JWT_SECRET and returns its trusted claims, or null if missing/expired/tampered/misconfigured. */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail closed: an unset shared secret must never silently downgrade to "trust anyone".
    console.error("serverSession.ts: JWT_SECRET is not set — refusing every request.");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.role !== "admin" && payload.role !== "warehouse_staff") return null;
    return {
      sub: payload.sub as string,
      role: payload.role,
      brandCode: (payload.brandCode as string | null) ?? null,
    };
  } catch {
    return null; // missing, expired, or tampered with
  }
}
