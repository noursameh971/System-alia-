import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "alia_session";
const PUBLIC_PATHS = ["/login"];

interface SessionPayload {
  sub: string;
  role: "admin" | "warehouse_staff";
  brandCode: string | null;
}

/**
 * Signature-verified read of the session cookie (see lib/auth.ts for how
 * it's written). This is the one place in the frontend that actually
 * trusts a JWT's claims to make an access-control decision — everywhere
 * else that reads it (useCurrentUser) is UI convenience only.
 */
async function readSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail closed: an unset shared secret must never silently downgrade to "trust anyone".
    console.error("proxy.ts: JWT_SECRET is not set — refusing every request.");
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

function homeFor(session: SessionPayload): string {
  return session.role === "admin" ? "/" : `/${session.brandCode}/products`;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await readSession(req);
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (isPublicPath) {
    // Already signed in — no reason to show the login form again.
    if (session) return NextResponse.redirect(new URL(homeFor(session), req.url));
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Admin: Master Dashboard is admin-only.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL(homeFor(session), req.url));
    }
    return NextResponse.next();
  }

  // Warehouse staff: locked to their assigned brand's [brand] subtree.
  // (Admins pass through untouched — they can switch between all workspaces.)
  const [, brandSegment] = pathname.split("/");
  if (session.role === "warehouse_staff" && brandSegment && brandSegment !== session.brandCode) {
    return NextResponse.redirect(new URL(homeFor(session), req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the favicon, and static assets under /public —
  // everything else (including "/") goes through the checks above.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
