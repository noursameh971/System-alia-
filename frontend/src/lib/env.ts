const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

// NEXT_PUBLIC_ vars are inlined into the bundle at build time, not read at
// request time — an unset/misconfigured one silently falls back to
// localhost in every visitor's browser (never reachable in production) and
// stays wrong until the *next build*, not the next deploy of the same
// build. This surfaces it loudly in the browser console instead of the
// only symptom otherwise being a cryptic "Request failed with status 200"
// from apiClient.ts (a relative fetch("" + path) redirected to /login by
// proxy.ts, whose HTML then fails to parse as the expected JSON envelope).
if (!configuredApiUrl && process.env.NODE_ENV === "production") {
  console.error(
    "NEXT_PUBLIC_API_URL is not set in this build — every API call will target " +
      "http://localhost:4000, which no deployed browser can reach. Set it in " +
      "Vercel's Production environment variables to the live backend's URL and " +
      "trigger a fresh deployment (adding the var alone doesn't update an " +
      "already-built deployment).",
  );
}

export const API_BASE_URL = configuredApiUrl || "http://localhost:4000";
