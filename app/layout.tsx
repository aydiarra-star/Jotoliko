import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { site } from "@/lib/content";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jotoliko.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${site.name} — ${site.slogan}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [
    "logiciel livraison Afrique",
    "gestion livraisons Sénégal",
    "SaaS logistique Dakar",
    "suivi livreurs",
    "encaissement livraison",
    "gestion commandes PME",
    "tournées livraison",
  ],
  authors: [{ name: site.name }],
  creator: site.name,
  openGraph: {
    type: "website",
    locale: "fr_SN",
    url: siteUrl,
    siteName: site.name,
    title: `${site.name} — ${site.slogan}`,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.slogan}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Aller au contenu
        </a>
        <Navbar />
        <main id="contenu">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
