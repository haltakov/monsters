import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { MonsterMark } from "@/components/monster-mark";

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="landing-shell legal-shell" lang="en">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Monsters DNA home">
          <MonsterMark className="brand-mark" />
          <span>MONSTERS</span>
        </Link>
        <Link href="/game/" className="header-play" data-short-label="Play">
          Play <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </header>
      <main className="legal-main">
        <Link href="/" className="legal-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to the island
        </Link>
        <header className="legal-heading">
          <p className="eyebrow">MONSTERS DNA · THE SMALL PRINT</p>
          <h1>{title}</h1>
          <p>{summary}</p>
          <time dateTime="2026-09-03">Last updated: 3 September 2026</time>
        </header>
        <article className="legal-copy">{children}</article>
      </main>
      <footer className="site-footer legal-footer">
        <span>Monsters DNA · A little world, built together.</span>
        <nav aria-label="Legal information" className="legal-links">
          <Link href="/privacy/">Privacy policy</Link>
          <Link href="/terms/">Terms of use</Link>
        </nav>
      </footer>
    </div>
  );
}
