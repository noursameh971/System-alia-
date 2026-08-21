"use client";

import { Suspense, useState, useSyncExternalStore, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Layers, Loader2 } from "lucide-react";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/apiClient";
import { useLocale } from "@/context/LocaleContext";
import { PLATFORM_CAPTION, PLATFORM_EDITION, PLATFORM_NAME } from "@/lib/platform";
import { landingPathFor } from "@/lib/routing";
import type { Locale } from "@/lib/locale";

/** Remembers the email only — see the note on the checkbox below for why it can't extend the session. */
const REMEMBERED_EMAIL_KEY = "alia_remembered_email";

/** The value never changes while the page is open, so there's nothing to subscribe to — useSyncExternalStore still requires the callback. */
function subscribeToNothing(): () => void {
  return () => {};
}

function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    // Private mode / storage disabled — start with an empty field.
    return "";
  }
}

// useSearchParams() (for the ?redirect= target set by proxy.ts) opts
// this subtree out of static rendering, so it needs its own Suspense
// boundary — the rest of the page has no async data and can render outside it.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const { t } = useLocale();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <AmbientBackdrop />

      {/* relative + z-10 lifts the card above the backdrop layers, which are
          absolutely positioned across the full canvas. Opaque white, not
          translucent: the previous glass card let the glow and grid bleed
          through the text, which is the readability problem this pass fixes. */}
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <PlatformMark />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-slate-900">{PLATFORM_NAME}</p>
              <p className="text-xs leading-snug text-slate-500">{t(PLATFORM_CAPTION)}</p>
            </div>
          </div>
          {/* justify-between puts this in the card's trailing corner, which
              mirrors to the left with the rest of the content in Arabic. */}
          <LanguageToggle />
        </div>

        <p className="mt-6 text-sm text-slate-600">{t("Sign in to access your enterprise workspace")}</p>

        <div className="mt-7">
          <LoginForm />
        </div>

        <p className="mt-8 border-t border-slate-100 pt-5 text-center text-[11px] tracking-wide text-slate-500">
          {t(PLATFORM_EDITION)} · © {new Date().getFullYear()} {PLATFORM_NAME}
        </p>
      </div>
    </div>
  );
}

/**
 * Full-canvas ambient layers. Purely decorative and direction-agnostic —
 * everything is centered or symmetric, so flipping the document to RTL moves
 * the card's contents without disturbing the background.
 */
function AmbientBackdrop() {
  return (
    <>
      {/* Organic glow: two offset blurred blobs rather than one circle, which
          reads as a flat vignette at this scale. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[30rem] -translate-x-[35%] -translate-y-[65%] rounded-full bg-violet-600/20 blur-[120px]"
      />
      {/* Ultra-faint grid, radially masked so it dissolves before the edges
          instead of ending on a hard line. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
    </>
  );
}

/** Abstract platform glyph — deliberately not a brand logo, since this page belongs to no single tenant. */
function PlatformMark() {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"
    >
      <Layers className="size-5" />
    </span>
  );
}

/** Compact AR/EN pill. Writes through LocaleContext, so the choice persists (cookie + localStorage) and survives the redirect into the app. */
function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const options: { value: Locale; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "ar", label: "AR" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-100 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === locale;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setLocale(option.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              selected ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { t } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // localStorage is a client-only store, so it's read through
  // useSyncExternalStore with a server snapshot of "" — that's what lets the
  // server HTML and the first client render agree, with React re-rendering
  // post-hydration once the real value is available. The seeding below is
  // then a plain render-time state adjustment, not a setState-in-effect.
  const rememberedEmail = useSyncExternalStore(subscribeToNothing, readRememberedEmail, () => "");
  const [seededFromStorage, setSeededFromStorage] = useState(false);
  if (!seededFromStorage && rememberedEmail) {
    setEmail(rememberedEmail);
    setRememberMe(true);
    setSeededFromStorage(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(email, password);

      try {
        if (rememberMe) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch {
        // Non-fatal: failing to persist a convenience shouldn't block the login.
      }

      // An explicit ?redirect= (set by proxy.ts when it intercepted a
      // deep link) wins — otherwise fall back to the role's home.
      const redirectTo = searchParams.get("redirect") || landingPathFor(user.role, user.brandCode);
      // Hard navigation, not router.replace/refresh: the session cookie was
      // just written via document.cookie above, and a full page load
      // guarantees the browser sends it on the very next request and
      // proxy.ts/every Server Component re-evaluates against it — a
      // client-side transition risked landing before that cookie was
      // reliably visible to the next request, which read as a stuck/looping
      // redirect.
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Something went wrong. Please try again."));
      setIsSubmitting(false);
    }
  }

  // Fixed light styling rather than `dark:` variants: the card is white on a
  // dark canvas by design, so a dark variant would only ever fire in the
  // wrong direction and reintroduce the low-contrast text this pass removes.
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-500 focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:opacity-50";

  const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          {t("Email")}
        </label>
        {/* dir="ltr" so an email address doesn't render with its domain flipped to the far side of the field in Arabic. */}
        <input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          placeholder="you@company.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          {t("Password")}
        </label>
        {/* dir="ltr" belongs on the wrapper, not just the input: the reveal
            button is positioned against this box, so if only the input were
            LTR the button's `end-1` would resolve to the opposite side in
            Arabic and land on top of the password characters. */}
        <div dir="ltr" className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            placeholder="••••••••"
            className={`${inputClass} pe-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            // tabIndex -1 keeps Tab going straight from the password field to
            // Sign in, which is the path someone typing a password expects.
            tabIndex={-1}
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            aria-pressed={showPassword}
            className="absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-700"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isSubmitting}
            className="size-4 rounded border-slate-300 accent-indigo-600"
          />
          {t("Remember me")}
        </label>

        <button
          type="button"
          onClick={() => setShowForgotHint((prev) => !prev)}
          className="text-sm font-medium text-indigo-600 underline-offset-2 transition-colors hover:text-indigo-700 hover:underline"
        >
          {t("Forgot password?")}
        </button>
      </div>

      {/* There's no self-serve reset endpoint — resets are admin-initiated
          from Settings > User Management — so this points at the real
          recovery path instead of linking to a route that doesn't exist. */}
      {showForgotHint ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
          {t("Ask an admin to reset your password from Settings → User Management.")}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:opacity-60 disabled:shadow-none"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("Signing in...")}
          </>
        ) : (
          t("Sign in")
        )}
      </button>
    </form>
  );
}
