import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The ground rules for playing and creating in MonstersDNA.",
  alternates: { canonical: "/terms/" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      summary="Build curious creatures, share the island, and play fairly. These are the ground rules."
    >
      <section>
        <h2>Using MonstersDNA</h2>
        <p>
          These terms cover the MonstersDNA website and game. By using the
          service, you agree to these terms. If you do not agree, do not use it.
          If you are not old enough to agree to these terms in your country, a
          parent or guardian must review them and permit your use.
        </p>
      </section>
      <section>
        <h2>Guest play and accounts</h2>
        <p>
          An account is optional. Guest access is tied to your browser storage
          and can be lost when that storage is cleared or you change devices or
          domains. Signing in can attach your current guest progress to your
          account. Keep your email account and sign-in links secure, and do not
          use someone else’s identity or account without permission.
        </p>
      </section>
      <section>
        <h2>Share the island fairly</h2>
        <p>
          Do not use abusive, discriminatory, impersonating, or unlawful names
          or content. Do not disclose another person’s private information,
          exploit security vulnerabilities, bypass access controls or rate
          limits, or deliberately disrupt the service. Normal in-game combat is
          part of the simulation; harassment of real people is not.
        </p>
        <p>
          Agents may use the game’s provided controls and WebMCP tools, subject
          to the same rules and technical limits as other players. You are
          responsible for agents you direct. We may rename or remove content,
          limit access, or suspend accounts to protect the game and its players.
        </p>
      </section>
      <section>
        <h2>Your creatures and a changing world</h2>
        <p>
          You keep any rights you have in your original contributions. By
          creating a monster or submitting content, you give us permission to
          store, display, simulate, and adapt it as needed to operate the game,
          including public ancestry and offspring. Only submit content you have
          the right to share.
        </p>
        <p>
          The shared world continues to change. Monsters can die, reproduce, or
          be affected by other players and administrators. Names, scores,
          creatures, and progress have no monetary value and are not guaranteed
          to remain available. This prototype may be rebalanced, reset, changed,
          or discontinued.
        </p>
      </section>
      <section>
        <h2>Our work and third-party services</h2>
        <p>
          The game’s branding, artwork, and software remain subject to their
          owners’ rights and any applicable licenses. These terms allow you to
          use the game, not to claim ownership of it. Google sign-in and other
          third-party services also have their own terms. Our{" "}
          <Link href="/privacy/">privacy policy</Link> explains data handling.
        </p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>
          We provide the prototype as available, without promising uninterrupted
          access, error-free operation, or preservation of progress. To the
          extent permitted by law, we disclaim implied warranties and liability
          for losses arising from interruptions or lost game data. Nothing in
          these terms excludes rights or liability that applicable law does not
          allow us to exclude, including mandatory consumer protections.
        </p>
      </section>
      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms as the service evolves. The latest version
          and its update date will be published here. Material changes may
          require additional notice or agreement where required by law. You can
          stop using the game at any time.
        </p>
      </section>
    </LegalPage>
  );
}
