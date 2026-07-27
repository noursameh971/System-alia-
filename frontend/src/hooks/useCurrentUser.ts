import { useSyncExternalStore } from "react";
import { getSession, type UserRole } from "@/lib/auth";

export interface CurrentUser {
  /** The signed-in user's own id (JWT `sub`) — e.g. to disable "deactivate" on their own row in the Users list. */
  id: string | null;
  role: UserRole | null;
  brandCode: string | null;
  brandId: string | null;
  /** True until the session cookie has been read on the client (avoids an SSR/hydration mismatch — see lib/auth.ts). */
  isLoading: boolean;
}

// Same useSyncExternalStore pattern as useLastWorkspaceCode.ts: reading the
// cookie during render (even guarded by typeof document) would mismatch
// between the server render and the client's first hydration pass.
// getServerSnapshot sidesteps that by returning a stable "still loading"
// object for both the server render and the client's hydration-matching
// pass, then resolving to the real session right after hydration commits.
const SERVER_SNAPSHOT: CurrentUser = { id: null, role: null, brandCode: null, brandId: null, isLoading: true };

let cachedKey: string | null = null;
let cachedSnapshot: CurrentUser = SERVER_SNAPSHOT;

function getSnapshot(): CurrentUser {
  const session = getSession();
  const key = session ? `${session.sub}:${session.exp}` : null;
  // Only build a new object when the underlying session actually changed —
  // useSyncExternalStore compares snapshots with Object.is and treats a new
  // reference as a change, so returning a fresh object every call would
  // re-render (and re-invoke subscribers) on every single read.
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = session
      ? { id: session.sub, role: session.role, brandCode: session.brandCode, brandId: session.brandId, isLoading: false }
      : { id: null, role: null, brandCode: null, brandId: null, isLoading: false };
  }
  return cachedSnapshot;
}

function subscribe(): () => void {
  // The session only ever changes via login/logout, both of which do a full
  // navigation (router.replace + router.refresh) rather than mutating state
  // in place, so there's nothing to listen for here.
  return () => {};
}

function getServerSnapshot(): CurrentUser {
  return SERVER_SNAPSHOT;
}

/**
 * UI-layer convenience only — reflects the session cookie for things like
 * "hide the Dashboard link" or "default a form to the right brand". The real
 * enforcement is proxy.ts (route access) and each backend route's
 * requireAuth/requireRole/requireBrandAccess, none of which change if this
 * hook is ever bypassed.
 */
export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
