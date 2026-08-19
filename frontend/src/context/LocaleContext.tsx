"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ar } from "@/dictionaries/ar";
import {
  LOCALE_STORAGE_KEY,
  isLocale,
  persistLocale,
  readLocaleCookie,
  type Locale,
} from "@/lib/locale";
import { getSettings } from "@/lib/settings";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  /** Translates an English source string to the active locale — identity passthrough in English, dictionary lookup (falling back to the English string) in Arabic. */
  t: (text: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * `initialLocale` comes from the root layout Server Component reading the
 * `alia_locale` cookie via next/headers — that's what lets a returning
 * visitor's `<html dir="rtl">` render correctly on the very first paint,
 * with no flash of the wrong direction. A brand-new browser (no cookie yet)
 * starts English/LTR and, once, checks the org's configured default
 * language (Settings > General & Language) — if that's Arabic, this
 * switches automatically (and persists), otherwise it just stays English.
 * Failures (e.g. not logged in yet, on /login) are silently ignored —
 * English is always a safe fallback.
 */
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // The single place `document.dir`/`lang` is driven from. Every language
  // change — segmented control, cross-tab sync, org-default bootstrap —
  // funnels through `locale` state, so the DOM direction can never drift
  // out of sync with what the components are rendering.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    if (readLocaleCookie() !== null) return; // user (or a prior visit) already made an explicit choice
    getSettings()
      .then((settings) => {
        if (settings.defaultLanguage === "ar") {
          persistLocale("ar");
          setLocaleState("ar");
        }
      })
      .catch(() => {
        // Not authenticated yet (e.g. /login), or the API isn't reachable — English stays the default.
      });
  }, []);

  // Switching language in one tab should switch it in the others too —
  // localStorage is mirrored alongside the cookie precisely so this event fires.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      if (isLocale(event.newValue)) setLocaleState(event.newValue);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (text: string) => (locale === "ar" ? (ar[text] ?? text) : text),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      dir: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
      t,
    }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
