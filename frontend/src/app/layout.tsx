import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandProvider } from "@/context/BrandContext";
import { DashboardShell } from "@/components/layout/DashboardShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alia Hijab & Noori — Inventory System",
  description: "Multi-brand inventory and order management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950">
        <BrandProvider>
          <DashboardShell>{children}</DashboardShell>
        </BrandProvider>
      </body>
    </html>
  );
}
