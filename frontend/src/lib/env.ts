const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

/**
 * A value with no http(s):// scheme (e.g. someone pasted just
 * "api.example.com" into Vercel's env var UI) resolves as a *relative*
 * reference in the browser instead of an absolute URL — every apiFetch call
 * then silently targets this Next.js app's own origin instead of the API,
 * which proxy.ts (guarding every path) bounces to /login. Symptoms: a
 * cryptic "Request failed with status 200", or a `redirect=` query param
 * that looks like a path built from the backend's own hostname
 * (e.g. "/api.example.com/api/auth/login"). Prepending https:// here fixes
 * it outright rather than leaving it as a trap for the next misconfigured
 * deploy; the console.error still names the exact cause so the Vercel env
 * var gets corrected at the source instead of relying on this fallback.
 */
function normalizeApiBaseUrl(raw: string | undefined): string {
  if (!raw) return "";
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

// NEXT_PUBLIC_ vars are inlined into the bundle at build time, not read at
// request time — an unset one silently falls back to localhost in every
// visitor's browser (never reachable in production) and stays wrong until
// the *next build*, not the next deploy of the same build.
if (!rawApiUrl && process.env.NODE_ENV === "production") {
  console.error(
    "NEXT_PUBLIC_API_URL is not set in this build — every API call will target " +
      "http://localhost:4000, which no deployed browser can reach. Set it in " +
      "Vercel's Production environment variables to the live backend's URL and " +
      "trigger a fresh deployment (adding the var alone doesn't update an " +
      "already-built deployment).",
  );
}

export const API_BASE_URL = normalizeApiBaseUrl(rawApiUrl) || "http://localhost:4000";
