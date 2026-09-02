import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Monsters DNA handles accounts, game progress, and analytics.",
  alternates: { canonical: "/privacy/" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="Play as a guest or sign in to keep your monster family. Here is what we store and why."
    >
      <section>
        <h2>About this policy</h2>
        <p>
          This policy covers Monsters DNA at monstersdna.com and its game and
          analytics subdomains. “We” means the team operating Monsters DNA.
        </p>
      </section>
      <section>
        <h2>Playing without an account</h2>
        <p>
          Your browser stores a guest identifier, your saved creature designs,
          and preferences in local storage. Our database stores the associated
          guest record, monsters, and shared-world progress. Clearing browser
          storage can remove your access to guest progress; it does not itself
          erase records from the shared world. Guest access does not
          automatically follow you to another browser, device, or domain.
        </p>
      </section>
      <section>
        <h2>Signing in</h2>
        <p>
          If you choose Google sign-in, we receive your Google account
          identifier, name, email address, verification status, and profile
          picture where available. We use these to create and authenticate your
          account, not to read your Gmail, contacts, or Drive. Google
          authentication tokens may be stored securely by our authentication
          system.
        </p>
        <p>
          For email sign-in, we use your email address to send a time-limited
          magic link through Resend. Resend processes the recipient address,
          message, and delivery information. Never share your sign-in links.
        </p>
        <p>
          Essential session cookies keep you signed in. Session and security
          records may include your IP address, browser information, and sign-in
          timestamps. Signing in links your current guest progress to your
          account so you can access it across devices.
        </p>
      </section>
      <section>
        <h2>A shared, public island</h2>
        <p>
          Monster nicknames, DNA, appearance, activity, ancestry, and game
          results can be seen by other players and visiting agents. Do not put
          personal information in a monster nickname. Your account email and
          authentication tokens are not part of the public monster archive.
          Administrators can manage creatures and the world.
        </p>
      </section>
      <section>
        <h2>Privacy-friendly analytics</h2>
        <p>
          We use Plausible to understand aggregate traffic, such as page visits,
          referral sources, device types, and approximate locations. Its script
          and events use our website’s first-party proxy, which forwards them
          through p.monstersdna.com. Our integration sends page paths, not URL
          query strings, monster DNA, nicknames, account IDs, or email
          addresses. The proxy removes cookies and authorization headers before
          forwarding requests to Plausible.
        </p>
        <p>
          Plausible does not use analytics cookies or persistent cross-site
          identifiers. It processes IP addresses and browser information to
          produce aggregate statistics without retaining raw IP addresses. See
          the{" "}
          <a href="https://plausible.io/data-policy">Plausible data policy</a>.
          Essential game storage and sign-in cookies are separate from
          analytics.
        </p>
      </section>
      <section>
        <h2>Why we process data and who helps us</h2>
        <p>
          We use game and account data to provide the service you request, and
          operational records to keep it secure and reliable. Where applicable,
          these purposes rely on providing the service under our terms and our
          legitimate interests in operating, protecting, and improving it. Where
          consent is required, it must be obtained separately.
        </p>
        <p>
          Hosting and network providers process requests and operational logs.
          Google, Resend, and Plausible process the information needed for their
          roles described above. Providers may process data in other countries
          under their applicable data-protection arrangements. We do not sell
          personal information or use it for targeted advertising.
        </p>
      </section>
      <section>
        <h2>Retention and your choices</h2>
        <p>
          Account and game records are kept while needed to provide your
          account, monster history, and the shared simulation. Security logs,
          expired sign-in records, and backups may remain for operational or
          legal needs. The prototype does not promise permanent storage or
          automatic deletion of every historical world record.
        </p>
        <p>
          You can play without signing in, sign out, clear browser storage, or
          revoke Google access through your Google account. These actions do not
          by themselves delete server-side data. Depending on your location, you
          may have rights to access, correct, delete, export, restrict, or
          object to processing of your personal data, and to complain to your
          local data-protection authority.
        </p>
      </section>
      <section>
        <h2>Younger players and updates</h2>
        <p>
          Younger players should use the game with a parent or guardian. Do not
          create an account if you are below the age at which you can consent to
          the relevant processing in your country without the required parental
          permission. We may update this policy as the game develops; the date
          above identifies the current version.
        </p>
      </section>
    </LegalPage>
  );
}
