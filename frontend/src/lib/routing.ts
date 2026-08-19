/**
 * The single source of truth for "where does this user belong right now".
 *
 * This used to be duplicated in four places — proxy.ts's homeFor(), the
 * login redirect, the root page, and each admin-only page's bounce — and
 * they had drifted apart (admins landed on the workspace picker from one
 * path and a brand's product list from another). Every one of those now
 * calls into here, so changing the policy means changing this file.
 *
 * Imported by proxy.ts, which runs on the edge runtime: keep this module
 * free of React, browser APIs, and Node built-ins.
 */

export type SessionRole = "admin" | "warehouse_staff";

/** Executive Company Dashboard — cross-brand, admin only. */
export const ADMIN_LANDING = "/dashboard";

/** Brand chooser. Its own route rather than "/" so that "/" can be a pure role-based redirector without stranding admins who want to switch workspace. */
export const WORKSPACE_PICKER = "/workspaces";

/** A workspace's home page. Kept here so the picker cards, the post-login redirect, and the "created a workspace" jump can't disagree about what a workspace's landing page is. */
export function workspaceHomePath(brandCode: string): string {
  return `/${brandCode.toLowerCase()}/dashboard`;
}

/**
 * Post-login (and post-bounce) destination for a session.
 *
 * - admin → the Executive Company Dashboard. Admins are cross-brand by
 *   definition, so dropping them into one arbitrary brand's route — or onto
 *   a picker they have to click through — buries the view they actually
 *   signed in for.
 * - warehouse_staff → their assigned workspace's dashboard. They're locked
 *   to one brand by proxy.ts, so there's nothing to choose.
 * - staff with no assigned brand → the picker. Shouldn't happen (the create
 *   -user form requires a brand for staff), but "/null/dashboard" is the
 *   alternative, so fail somewhere navigable.
 */
export function landingPathFor(role: SessionRole, brandCode: string | null | undefined): string {
  if (role === "admin") return ADMIN_LANDING;
  if (!brandCode) return WORKSPACE_PICKER;
  return workspaceHomePath(brandCode);
}
