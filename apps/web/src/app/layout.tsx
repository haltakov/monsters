import type { Metadata, Viewport } from "next";
import { Comfortaa, IBM_Plex_Mono, Nunito } from "next/font/google";
import { LanguageProvider } from "@/components/i18n";
import "./globals.css";

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
  title: {
    default: "Monsters — отгледай малък див свят",
    template: "%s · Monsters",
  },
  description:
    "Създавай чудовища, изследвай острова им и открий какво може тяхното DNA.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="bg"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
