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
  } catch (err) {
    // Logged (not swallowed): a signature-verification failure here looks
    // identical to "no session" to the caller (redirect to /login) either
    // way, but a *mismatched* JWT_SECRET between this app and the backend
    // that signed the token — as opposed to a genuinely missing/expired
    // cookie — produces this on literally every request, which reads as an
    // infinite post-login redirect loop with no visible cause otherwise.
    const reason = err instanceof Error ? err.name : "unknown error";
    console.error(
      `serverSession.ts: token verification failed (${reason}). If this fires on every request right after ` +
        "a successful login, JWT_SECRET on this deployment almost certainly doesn't match the backend's — " +
        "they must be byte-for-byte identical.",
    );
    return null;
  }
}
