"use client";

import Link from "next/link";
import { ArrowRight, Dna, Footprints, Sprout } from "lucide-react";
import {
  LanguageSwitcher,
  useI18n,
  useLocalizedTitle,
} from "@/components/i18n";
import { MonsterMark } from "@/components/monster-mark";

export default function Home() {
  const { t } = useI18n();
  useLocalizedTitle("meta.homeTitle");

  return (
    <div className="landing-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label={t("landing.home")}>
          <MonsterMark className="brand-mark" />
          <span>MONSTERS</span>
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

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{t("landing.eyebrow")}</p>
            <h1>
              {t("landing.titleOne")}
              <br />
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

          <div
            className="diorama-wrap"
            aria-label={t("landing.diorama")}
          >
            <div className="diorama-sun" />
            <div className="cloud cloud-one" />
            <div className="cloud cloud-two" />
            <div className="island-shadow" />
            <div className="island">
              <div className="river" />
              <div className="tiny-tree tree-one">
                <i />
              </div>
              <div className="tiny-tree tree-two">
                <i />
              </div>
              <div className="tiny-tree tree-three">
                <i />
              </div>
              <div className="tiny-rock rock-one" />
              <div className="tiny-rock rock-two" />
              <MonsterMark className="diorama-monster" />
            </div>
            <div className="specimen-tag">
              <span>{t("landing.specimen")}</span>
              <strong>{t("landing.specimenName")}</strong>
              <small>{t("landing.specimenTraits")}</small>
            </div>
          </div>
        </section>

        <section className="trait-strip" aria-label={t("landing.features")}>
          <article>
            <Dna size={24} />
            <div>
              <strong>{t("landing.dnaTitle")}</strong>
              <span>{t("landing.dnaBody")}</span>
            </div>
          </article>
          <article>
            <Footprints size={24} />
            <div>
              <strong>{t("landing.tracksTitle")}</strong>
              <span>{t("landing.tracksBody")}</span>
            </div>
          </article>
          <article>
            <Sprout size={24} />
            <div>
              <strong>{t("landing.worldTitle")}</strong>
              <span>{t("landing.worldBody")}</span>
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <span>{t("landing.footer")}</span>
        <span>{t("landing.version")}</span>
      </footer>
    </div>
  );
}
