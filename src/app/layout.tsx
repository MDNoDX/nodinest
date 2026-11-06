import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Source_Serif_4 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NativeBridge } from "@/components/pwa/native-bridge";
import { Pwa } from "@/components/pwa/pwa";
import { INSTALL_SCRIPT } from "@/lib/install-script";
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

/** Only the name in the logo: warm, bookish, with a real Ö. */
const brand = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "600",
  variable: "--font-brand",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return {
    title: { default: "Röznoma", template: "%s · Röznoma" },
    description: t("tagline"),
    applicationName: "Röznoma",
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: "Röznoma", statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  // Android: the page shrinks above the keyboard (instead of sliding under it),
  // so a chat's field and its newest messages stay in view.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e15" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${brand.variable} ${serif.variable}`}
    >
      <head>
        {/* The browser's install offer comes early, before React: keep it for later pages. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <ThemeProvider>
          <NextIntlClientProvider>
            {children}
            <Toaster />
            <Pwa />
            <NativeBridge />
            <SiteAnalytics />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
