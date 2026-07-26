/**
 * TEMPORARY placeholder. The backend's real auth module (login + JWT
 * issuance) hasn't been built yet — Step 3 added an AUTH_BYPASS dev flag so
 * the API can be called with no token at all while that's true. This
 * function is the one place the frontend will read a stored JWT from once
 * login exists (e.g. an httpOnly cookie or a client-side store); for now it
 * returns no Authorization header, which is exactly what AUTH_BYPASS mode
 * expects. Nothing else in the app should reach into token storage directly.
 */
export function getAuthHeaders(): HeadersInit {
  return {};
}
