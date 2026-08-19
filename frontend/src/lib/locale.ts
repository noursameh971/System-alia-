export type Locale = "en" | "ar";

const LOCALE_COOKIE = "alia_locale";
const LOCALE_STORAGE_KEY = "alia_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

/**
 * NOT httpOnly, same tradeoff as auth.ts's session cookie — this is a
 * client-readable UI preference, not a secret, and the root layout (a
 * Server Component) needs to read it via next/headers' cookies() to render
 * the correct `dir`/`lang` on the very first paint (no SSR/hydration flash
 * for returning visitors). The cookie is therefore the source of truth;
 * localStorage below is a mirror that exists purely to get the `storage`
 * event, which is what syncs the choice across open tabs.
 */
export function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : null;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function readLocaleStorage(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // Private mode / storage disabled — the cookie still carries the preference.
    return null;
  }
}

export function writeLocaleStorage(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Non-fatal, see readLocaleStorage.
  }
}

/** Writes both stores at once — always use this so the cookie and the mirror can't drift. */
export function persistLocale(locale: Locale): void {
  writeLocaleCookie(locale);
  writeLocaleStorage(locale);
}

export { LOCALE_COOKIE, LOCALE_STORAGE_KEY };
