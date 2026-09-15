import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_LANDING, FACTORY_LANDING, WORKSPACE_PICKER, landingPathFor } from "@/lib/routing";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/serverSession";

const PUBLIC_PATHS = ["/login"];

const IS_DEV = process.env.NODE_ENV !== "production";

/** Delegates to the shared policy in lib/routing.ts so the edge redirect and the client-side ones can never disagree. */
function homeFor(session: SessionPayload): string {
  return landingPathFor(session.role, session.brandCode);
}

/**
 * Local-development-only convenience: mints a real session by calling the
 * backend's dev-only POST /api/auth/dev-login (see backend/auth.routes.ts —
 * that route is never registered when NODE_ENV is "production", so this
 * call 404s harmlessly anywhere but a developer's own machine, and the
 * IS_DEV check above means this function's body never runs in a production
 * deployment either). Deliberately reuses the backend's real signing path
 * instead of fabricating a token here — a token minted by hand would need
 * this app to hold JWT_SECRET for *signing*, not just verification, and
 * would carry a `sub` that isn't a real user id, breaking anything
 * downstream that trusts it. Returns null on any failure (backend not
 * running, no admin seeded yet, network error) so the caller can fall back
 * to the normal /login redirect instead of breaking the request.
 */
async function mintDevSession(req: NextRequest): Promise<{ token: string } | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    // A hard timeout matters here more than for a normal request: this
    // runs on the hot path of every unauthenticated request, so a backend
    // that's unreachable (not just erroring) must fail fast into the
    // /login fallback rather than hang the whole navigation.
    const res = await fetch(new URL("/api/auth/dev-login", apiUrl), {
      method: "POST",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { token?: string } };
    const token = body.data?.token;
    if (!token) return null;
    // Confirms the token actually verifies before we trust it — same check
    // every other session on this app has to pass.
    const verified = await verifySessionToken(token);
    if (!verified) return null;
    return { token };
  } catch (err) {
    console.error(`proxy.ts: dev-login bypass failed (${req.nextUrl.pathname}):`, err);
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Signature-verified read of the session cookie (see lib/auth.ts for how
  // it's written). This is the one place in the frontend that actually
  // trusts a JWT's claims to make an access-control decision — everywhere
  // else that reads it (useCurrentUser) is UI convenience only.
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (isPublicPath) {
    // Already signed in — no reason to show the login form again.
    if (session) return NextResponse.redirect(new URL(homeFor(session), req.url));
    return NextResponse.next();
  }

  if (!session) {
    if (IS_DEV) {
      const minted = await mintDevSession(req);
      if (minted) {
        // Redirect back to the same URL rather than continuing this same
        // request with NextResponse.next(): the cookie set below only
        // reaches the browser on this response, so anything that reads it
        // server-side (this file's next pass, "/"'s own cookies() read)
        // needs a real round trip first, not a same-request continuation.
        const response = NextResponse.redirect(new URL(`${pathname}${search}`, req.url));
        response.cookies.set(SESSION_COOKIE, minted.token, { path: "/", sameSite: "lax" });
        return response;
      }
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Executive Company Dashboard is admin-only.
  if (pathname === ADMIN_LANDING || pathname.startsWith(`${ADMIN_LANDING}/`)) {
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL(homeFor(session), req.url));
    }
    return NextResponse.next();
  }

  // Factory & Manufacturing is its own standalone workspace, same admin-only
  // gate as the Executive Company Dashboard above — it isn't scoped to any
  // brand, so there's no [brand] segment to check against.
  if (pathname === FACTORY_LANDING || pathname.startsWith(`${FACTORY_LANDING}/`)) {
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL(homeFor(session), req.url));
    }
    return NextResponse.next();
  }

  if (session.role === "warehouse_staff" || session.role === "finance") {
    // The picker is for people with a choice to make. Staff/finance users
    // who have a brand don't, so send them home — but without one must be
    // let through, because homeFor() sends them here and bouncing them would
    // loop forever.
    if (pathname === WORKSPACE_PICKER) {
      if (session.brandCode) return NextResponse.redirect(new URL(homeFor(session), req.url));
      return NextResponse.next();
    }

    // Otherwise: locked to their assigned brand's [brand] subtree. "/" has an
    // empty first segment and falls through to the role-based redirector.
    // (Admins skip this block entirely — they can reach every workspace.)
    const [, brandSegment, moduleSegment] = pathname.split("/");
    if (brandSegment && brandSegment !== session.brandCode) {
      return NextResponse.redirect(new URL(homeFor(session), req.url));
    }

    // Finance is further locked to just the Finance module within its
    // brand — Products, Inventory, Orders, and Settings are exactly the
    // areas this role exists to not have access to.
    if (session.role === "finance" && moduleSegment && moduleSegment !== "finance") {
      return NextResponse.redirect(new URL(homeFor(session), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the favicon, and static assets under /public —
  // everything else (including "/") goes through the checks above.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
