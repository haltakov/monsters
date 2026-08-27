import Link from "next/link";
import { ArrowRight, Dna, Footprints, Sprout } from "lucide-react";
import { MonsterMark } from "@/components/monster-mark";

export default function Home() {
  return (
    <div className="landing-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Monsters home">
          <MonsterMark className="brand-mark" />
          <span>MONSTERS</span>
        </Link>
        <Link href="/game" className="header-play">
          Enter the island <ArrowRight size={17} strokeWidth={2.5} />
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">FIELD NOTES · DAY ONE</p>
            <h1>
              A small world.
              <br />
              <span>Infinite little weirdos.</span>
            </h1>
            <p className="hero-lede">
              Grow monsters from wild DNA, then watch them explore, adapt, make
              friends—or decide that lunch has legs.
            </p>
            <div className="hero-actions">
              <Link href="/game" className="primary-cta">
                Play the prototype <ArrowRight size={20} strokeWidth={2.7} />
              </Link>
              <span className="prototype-note">
                No account. No saving. Just play.
              </span>
            </div>
          </div>

          <div
            className="diorama-wrap"
            aria-label="A tiny monster island illustration"
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
              <span>SPECIMEN 001</span>
              <strong>MOSS MUNCHER</strong>
              <small>friendly · hungry · surprisingly fast</small>
            </div>
          </div>
        </section>

        <section className="trait-strip" aria-label="Game features">
          <article>
            <Dna size={24} />
            <div>
              <strong>DNA makes the monster</strong>
              <span>Eyes, legs, appetite, speed, instincts.</span>
            </div>
          </article>
          <article>
            <Footprints size={24} />
            <div>
              <strong>Every choice leaves tracks</strong>
              <span>Hunt, graze, gather, wander, survive.</span>
            </div>
          </article>
          <article>
            <Sprout size={24} />
            <div>
              <strong>The world grows with them</strong>
              <span>A living island we’ll build together.</span>
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <span>Built by a dad, his son, and a lot of curious creatures.</span>
        <span>Prototype 0.1</span>
      </footer>
    </div>
  );
}
