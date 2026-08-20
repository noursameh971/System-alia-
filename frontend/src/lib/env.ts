const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

/**
 * Hardcoded so the app works even when Vercel's env var UI fails to save
 * NEXT_PUBLIC_API_URL (observed in production) — NEXT_PUBLIC_ vars are
 * inlined at build time, so a var that silently didn't save leaves every
 * visitor's browser targeting localhost with no way to recover short of a
 * rebuild. If the backend ever moves, update this constant (and redeploy)
 * rather than depending solely on the Vercel dashboard.
 */
const PRODUCTION_API_URL = "https://system-alia-production.up.railway.app";
const DEVELOPMENT_API_URL = "http://localhost:4000";

/**
 * A value with no http(s):// scheme (e.g. someone pasted just
 * "api.example.com" into Vercel's env var UI) resolves as a *relative*
 * reference in the browser instead of an absolute URL — every apiFetch call
 * then silently targets this Next.js app's own origin instead of the API,
 * which proxy.ts (guarding every path) bounces to /login. Symptoms: a
 * cryptic "Request failed with status 200", or a `redirect=` query param
 * that looks like a path built from the backend's own hostname
 * (e.g. "/api.example.com/api/auth/login"). Prepending https:// here fixes
 * it outright rather than leaving it as a trap for a misconfigured env var.
 */
function normalizeApiBaseUrl(raw: string): string {
  if (!/^https?:\/\//i.test(raw)) {
    console.error(
      `NEXT_PUBLIC_API_URL ("${raw}") is missing its http(s):// scheme, so every API call would resolve ` +
        "as a relative path on this Next.js app instead of reaching the backend. Prepending https:// so it " +
        "still works, but fix the value in Vercel's Production environment variables and redeploy.",
    );
    return `https://${raw}`;
  }
  return raw.replace(/\/+$/, ""); // strip a trailing slash — apiFetch always joins with a leading-slash path.
}

// NEXT_PUBLIC_API_URL still wins when it's actually set correctly — this
// only falls back to the hardcoded production URL when the env var is
// missing/empty, so a future backend move can still be done via Vercel
// without a code change, but a broken/unsaved env var can no longer break
// login the way it did before.
export const API_BASE_URL = rawApiUrl
  ? normalizeApiBaseUrl(rawApiUrl)
  : process.env.NODE_ENV === "production"
    ? PRODUCTION_API_URL
    : DEVELOPMENT_API_URL;
