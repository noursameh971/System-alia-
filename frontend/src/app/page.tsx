import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { landingPathFor } from "@/lib/routing";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/serverSession";

/**
 * "/" is a pure server-side, role-based redirector — it never renders a
 * page of its own, so there's no client-side loading flash while a session
 * check resolves.
 *
 * proxy.ts already guarantees a verified session by the time this runs (an
 * anonymous request to "/" is bounced to /login at the edge), so the only
 * question left is *which* home this user gets: admins land on the
 * Executive Company Dashboard, warehouse staff on their assigned workspace.
 * The brand chooser that used to live here moved to /workspaces so admins
 * can still reach it deliberately without "/" bouncing them straight back
 * out.
 *
 * The `!session` branch is a defensive fallback, not the expected path in
 * production — it only matters if proxy.ts's matcher is ever changed to
 * stop covering "/".
 */
export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) redirect("/login");
  redirect(landingPathFor(session.role, session.brandCode));
}
