import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Pwa } from "@/components/pwa/pwa";
import { SiteAnalytics } from "@/components/pwa/analytics";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-serif-display",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return {
    title: { default: "NodiNote", template: "%s · NodiNote" },
    description: t("tagline"),
    applicationName: "NodiNote",
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: "NodiNote", statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider>
          <NextIntlClientProvider>
            {children}
            <Toaster />
            <Pwa />
            <SiteAnalytics />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
