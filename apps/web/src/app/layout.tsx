import type { Metadata } from "next";
import { Fredoka, IBM_Plex_Mono, Nunito } from "next/font/google";
import "./globals.css";

const display = Fredoka({ variable: "--font-display", subsets: ["latin"] });
const body = Nunito({ variable: "--font-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Monsters — grow a tiny wild world",
    template: "%s · Monsters",
  },
  description:
    "Create curious monsters, explore their island, and discover what their DNA can do.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
