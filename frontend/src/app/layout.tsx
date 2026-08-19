import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { LocaleProvider } from "@/context/LocaleContext";
import { LocaleToaster } from "@/components/ui/LocaleToaster";
import { LOCALE_COOKIE, type Locale } from "@/lib/locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist ships no Arabic glyphs, so without this every Arabic string would
// fall back to whatever the OS picks — the classic "translated but looks
// broken" result. Loaded on every page (not just when locale === "ar") so
// switching language never flashes unstyled Arabic; globals.css lists it
// after Geist in the stack, and the browser picks it per-glyph.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "Alia Hijab & Noori — Inventory System",
  description: "Multi-brand inventory and order management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading the locale cookie here (a Server Component) is what lets a
  // returning visitor's <html dir="rtl"> render correctly on the very first
  // paint — see LocaleContext.tsx for why a brand-new browser (no cookie
  // yet) always starts English/LTR instead.
  const cookieStore = await cookies();
  const initialLocale: Locale = cookieStore.get(LOCALE_COOKIE)?.value === "ar" ? "ar" : "en";

  return (
    <html
      lang={initialLocale}
      dir={initialLocale === "ar" ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950">
        <LocaleProvider initialLocale={initialLocale}>
          {children}
          <LocaleToaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
