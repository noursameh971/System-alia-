export interface CurrentUser {
  role: "admin" | "warehouse_staff";
}

/**
 * TEMPORARY placeholder, same spirit as lib/auth.ts: there's no login yet,
 * so there's no real signed-in user to read a role from. Hardcoded to
 * 'admin' because the backend's AUTH_BYPASS dev flag also treats every
 * request as admin by default — this keeps the frontend gate consistent
 * with what the backend will actually let through right now. This is a
 * UI-layer convenience only (hide the Dashboard link, redirect non-admins
 * away from /dashboard); the real enforcement is server-side
 * (requireRole('admin') on GET /api/dashboard/summary), which doesn't
 * change when this hook is later replaced with a real session lookup.
 */
export function useCurrentUser(): CurrentUser {
  return { role: "admin" };
}
