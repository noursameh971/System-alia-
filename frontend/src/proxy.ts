import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_LANDING, WORKSPACE_PICKER, landingPathFor } from "@/lib/routing";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/serverSession";

const PUBLIC_PATHS = ["/login"];

/** Delegates to the shared policy in lib/routing.ts so the edge redirect and the client-side ones can never disagree. */
function homeFor(session: SessionPayload): string {
  return landingPathFor(session.role, session.brandCode);
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

  if (session.role === "warehouse_staff") {
    // The picker is for people with a choice to make. Staff who have a brand
    // don't, so send them home — but staff *without* one must be let through,
    // because homeFor() sends them here and bouncing them would loop forever.
    if (pathname === WORKSPACE_PICKER) {
      if (session.brandCode) return NextResponse.redirect(new URL(homeFor(session), req.url));
      return NextResponse.next();
    }

    // Otherwise: locked to their assigned brand's [brand] subtree. "/" has an
    // empty first segment and falls through to the role-based redirector.
    // (Admins skip this block entirely — they can reach every workspace.)
    const [, brandSegment] = pathname.split("/");
    if (brandSegment && brandSegment !== session.brandCode) {
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
