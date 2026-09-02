"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Dna,
  Egg,
  Footprints,
  HeartPulse,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";
import {
  LanguageSwitcher,
  useI18n,
  useLocalizedTitle,
} from "@/components/i18n";
import { MonsterMark } from "@/components/monster-mark";

export default function Home() {
  const { t, option } = useI18n();
  useLocalizedTitle("meta.homeTitle");

  return (
    <div className="landing-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label={t("landing.home")}>
          <MonsterMark className="brand-mark" />
          <span>MonstersDNA</span>
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
          <Link
            href="/game"
            className="header-play"
            data-short-label={t("landing.playShort")}
          >
            {t("landing.enter")} <ArrowRight size={17} strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <figure className="hero-world">
            <Image
              src="/images/monster-island-hero.webp"
              alt={t("landing.diorama")}
              fill
              priority
              unoptimized
              sizes="(max-width: 760px) 100vw, 1240px"
            />
            <div className="hero-world-shade" aria-hidden="true" />
            <figcaption className="specimen-tag">
              <span>{t("landing.specimen")}</span>
              <strong>{t("landing.specimenName")}</strong>
              <small>{t("landing.specimenTraits")}</small>
            </figcaption>
            <div className="world-coordinate" aria-hidden="true">
              42°N · MONSTER ISLAND · LIVE
            </div>
          </figure>

          <div className="hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" /> {t("landing.eyebrow")}
            </p>
            <h1>
              {t("landing.titleOne")}
              <span>{t("landing.titleTwo")}</span>
            </h1>
            <p className="hero-lede">{t("landing.lede")}</p>
            <div className="hero-actions">
              <Link href="/game" className="primary-cta">
                {t("landing.play")} <ArrowRight size={20} strokeWidth={2.7} />
              </Link>
              <span className="prototype-note">{t("landing.note")}</span>
            </div>
          </div>
        </section>

        <section className="life-cycle" aria-label={t("landing.cycleLabel")}>
          <article>
            <Dna size={20} />
            <span>01</span>
            <strong>{t("landing.cycleDna")}</strong>
          </article>
          <i aria-hidden="true" />
          <article>
            <Egg size={20} />
            <span>02</span>
            <strong>{t("landing.cycleHatch")}</strong>
          </article>
          <i aria-hidden="true" />
          <article>
            <Footprints size={20} />
            <span>03</span>
            <strong>{t("landing.cycleLive")}</strong>
          </article>
          <i aria-hidden="true" />
          <article>
            <Sparkles size={20} />
            <span>04</span>
            <strong>{t("landing.cycleEvolve")}</strong>
          </article>
        </section>

        <section className="landing-story">
          <div className="story-heading">
            <p className="eyebrow">{t("landing.storyEyebrow")}</p>
            <h2>{t("landing.storyTitle")}</h2>
            <p>{t("landing.storyBody")}</p>
            <div
              className="gene-ribbon"
              role="group"
              aria-label={t("landing.geneLabel")}
            >
              {["wings", "gills", "fangs", "pack", "spots", "fin"].map(
                (gene) => (
                  <span key={gene}>{option(gene)}</span>
                ),
              )}
            </div>
          </div>

          <div
            className="trait-grid"
            role="group"
            aria-label={t("landing.features")}
          >
            <article className="trait-card trait-card-dna">
              <Dna size={27} />
              <div>
                <strong>{t("landing.dnaTitle")}</strong>
                <p>{t("landing.dnaBody")}</p>
              </div>
            </article>
            <article className="trait-card trait-card-world">
              <Sprout size={27} />
              <div>
                <strong>{t("landing.worldTitle")}</strong>
                <p>{t("landing.worldBody")}</p>
              </div>
            </article>
            <article className="trait-card trait-card-life">
              <HeartPulse size={27} />
              <div>
                <strong>{t("landing.tracksTitle")}</strong>
                <p>{t("landing.tracksBody")}</p>
              </div>
            </article>
            <article className="trait-card trait-card-family">
              <Users size={27} />
              <div>
                <strong>{t("landing.familyTitle")}</strong>
                <p>{t("landing.familyBody")}</p>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-callout">
          <MonsterMark className="callout-monster" />
          <div>
            <p>{t("landing.ctaKicker")}</p>
            <h2>{t("landing.ctaTitle")}</h2>
            <span>{t("landing.ctaBody")}</span>
          </div>
          <Link href="/game" className="callout-cta">
            {t("landing.ctaAction")} <ArrowRight size={20} />
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <span>{t("landing.footer")}</span>
        <nav className="legal-links" aria-label={t("legal.navigation")}>
          <Link href="/privacy/">{t("legal.privacy")}</Link>
          <Link href="/terms/">{t("legal.terms")}</Link>
        </nav>
      </footer>
    </div>
  );
}
