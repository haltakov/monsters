import type { Metadata, Viewport } from "next";
import { Comfortaa, IBM_Plex_Mono, Nunito } from "next/font/google";
import { LanguageProvider } from "@/components/i18n";
import { Analytics } from "@/components/analytics";
import "./globals.css";
import "./legal.css";

const display = Comfortaa({
  variable: "--font-display",
  subsets: ["cyrillic", "latin"],
});
const body = Nunito({
  variable: "--font-body",
  subsets: ["cyrillic", "latin"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://monstersdna.com"),
  title: {
    default: "Monsters DNA — grow a tiny wild world",
    template: "%s · Monsters DNA",
  },
  description:
    "Create your own DNA-based monster, explore a living island, and grow a strange new family.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
