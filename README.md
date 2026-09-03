# MonstersDNA

A small 3D monster-world game that a father and son can build together. Monsters now live in one persistent, server-authoritative public world: players can join from multiple browsers, control their own creatures, and leave the ecosystem running while they are away.

The island now has 10× the original playable land area, with extended rivers, six bridges, outer hills, and distributed trees, bushes, rocks, and plants.

## Stack

- **Web:** statically exported Next.js, React Three Fiber / Three.js, TypeScript, Tailwind CSS
- **API:** NestJS, Socket.IO, TypeScript, Prisma ORM
- **Database:** PostgreSQL
- **Simulation:** shared deterministic `@monsters/game-core` package, fixed at 10 Hz
- **Monorepo:** pnpm workspaces

## Start locally

Prerequisites: Node 22+, pnpm 11+, and PostgreSQL.

```bash
createdb monsters
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm db:deploy
pnpm dev
```

Open [http://localhost:3100](http://localhost:3100). The API health check lives at [http://localhost:3101/api/health](http://localhost:3101/api/health).

## Controls

- `W` / `↑` — walk forward; `S` / `↓` — walk backward
- `A` / `D` — face and move 90° left or right without rotating the camera
- `←` / `→` — turn the monster and camera together
- Hold `Shift` — sprint
- Move the mouse after clicking the game — rotate only the camera; the monster aligns with it once movement starts
- `E` — eat
- `Space` — attack
- **Edit monster** — open the rotatable character creator and DNA editor
- `Esc` — release the mouse
- Touchscreen — twin virtual sticks and action buttons

The player cannot enter the sea or river. Cross the river using one of the log bridges.

Walking gradually uses energy, sprinting drains it faster, and every attack costs 7 energy. Eat a compatible nearby resource to recover energy. Health recovers over time according to current energy. Reaching zero health or energy permanently kills the monster; its owner can then select another living monster or create a new one.

## Monster DNA

The creator exposes 18 deterministic genes covering anatomy, appearance, habitat, diet, social behavior, and mesh style. The builder and direct DNA field use the same versioned `M6` codec (with automatic support for older DNA codes), and the preview shares its geometry component with the playable monster. A valid DNA string therefore always produces exactly the same creature.

The server mixes parental DNA deterministically, applies seeded mutations, creates persistent eggs, and hatches babies with recorded lineage and generation.

### Aging and daily seasons

Monsters age in real-time hours, including API downtime. Functional DNA (body,
size, build, armor, metabolism and diet) determines a reproducible **2–12 hour**
lifespan; cosmetic changes do not extend it. The first 75% of life is at full
speed, followed by gradual slowing to 40% of normal speed. Maximum age causes
permanent death, even with full health and energy. Age and lifespan appear in
the HUD and monster history, with lifespan also shown in the creator.

Every day at **00:00 UTC**, the authoritative API resets the public island and
its resources, spawning ten new land-based wild monsters. Accounts, player
monster history and lineage remain intact; living monsters from the previous
season are archived as dead. Connected players return to spectating and can
spawn new copies. The next reset is stored in PostgreSQL and performed once
on startup if midnight was missed. Deploying this feature does not immediately
reset an existing world: its first deadline is the next UTC midnight.

No separate cron service is required. The world-owning API process handles the
schedule under its existing advisory lock. The explicit admin reset remains
a separate destructive operation that also removes the world's monster history.

## Project layout

```text
apps/
  web/   Static Next.js game frontend
  api/   NestJS API and Prisma schema
packages/
  game-core/  Pure deterministic DNA, terrain, protocol, and simulation logic
```

PostgreSQL stores anonymous guest identities, owned monsters, lineage, semantic lifecycle events, and the latest recoverable world checkpoint. The API holds hot simulation state in memory, checkpoints it at least every 15 seconds, and uses a dedicated PostgreSQL advisory lock so only one API container can advance the world during a rolling deployment. Player movement is predicted locally for responsiveness; health, energy, combat, AI, mating, eggs, and death remain authoritative on the server.

## Accounts

Accounts are optional. Every browser starts with a device-bound local guest stored in `localStorage`, so the game remains immediately playable. After a Google or email magic-link sign-in, the browser's existing monsters are claimed by that account and become available in its alive/dead history across devices. Player-chosen monster nicknames are unique regardless of capitalization, and public lineage pages show parents, descendants, copies, and creation origin without exposing account email addresses.

For local auth setup, add these values to `apps/api/.env`:

```text
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3101
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=MonstersDNA <login@your-verified-domain.example>
```

Use `http://localhost:3101/api/auth/callback/google` as the local Google callback. In production use `https://api.monstersdna.com/api/auth/callback/google`, set `BETTER_AUTH_URL=https://api.monstersdna.com`, and set `AUTH_COOKIE_DOMAIN=.monstersdna.com` so the static game and API can share the secure session cookie. Keep `WEB_ORIGIN=https://monstersdna.com` for REST, WebSocket, and Better Auth origin checks.

Google OAuth setup (Web application):

- Authorized domain: `monstersdna.com`.
- Authorized JavaScript origin: `https://monstersdna.com`.
- Authorized redirect URI: `https://api.monstersdna.com/api/auth/callback/google`.
- Homepage: `https://monstersdna.com/`.
- Privacy policy: `https://monstersdna.com/privacy/`.
- Terms of service: `https://monstersdna.com/terms/`.

Verify the sender domain in Resend before setting `RESEND_FROM_EMAIL=MonstersDNA <login@monstersdna.com>`. Supply `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `RESEND_API_KEY` as runtime-only secrets in the MonstersDNA API resource; never in the frontend build. Sign-in methods remain hidden until their required credentials are set. Preserve `BETTER_AUTH_SECRET` across deployments.

Changing domains does not transfer browser local storage or existing cookies. Guests on an older domain do not automatically regain their guest history on the new domain; accounts that already claimed that history can sign in to recover it.

The legal pages are starter text, not a legal-compliance guarantee. Before public account signup, the operator should review controller/contact details, retention, applicable jurisdiction, and child-account requirements. No contact email is published in the starter pages.

Administrators are deliberately not assignable through the application. Mark one directly in PostgreSQL:

```sql
UPDATE "User" SET "role" = 'admin' WHERE "email" = 'you@example.com';
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The optional multiplayer load harness defaults to 20 Socket.IO clients and can target a 100-monster test world:

```bash
pnpm loadtest -- --clients=20 --seconds=180
```

## Production deployment

The repository includes two root-level production images for the Coolify deployment:

- `Dockerfile.app` builds the static Next.js export and serves it with Nginx on port `3000`.
- `Dockerfile.server` builds the NestJS API, applies pending Prisma migrations on startup, and serves it on port `3000`.

Create a PostgreSQL 17 resource and configure the API with:

```text
DATABASE_URL=<Coolify internal PostgreSQL URL>
WEB_ORIGIN=https://monstersdna.com
PORT=3000
BETTER_AUTH_SECRET=<strong random secret>
BETTER_AUTH_URL=https://api.monstersdna.com
AUTH_COOKIE_DOMAIN=.monstersdna.com
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=MonstersDNA <login@your-verified-domain.example>
```

The frontend health endpoint is `/healthz`; the API health endpoint is `/api/health` and verifies its database connection.

### Domains and first-party analytics

Route `https://monstersdna.com` to the MonstersDNA Game resource on port 3000. Route `https://api.monstersdna.com` to MonstersDNA API on port 3000. `https://p.monstersdna.com` is the existing analytics upstream; **do not route it to the game container** or change its DNS. The frontend's Nginx exposes two fixed analytics proxy paths, not an open proxy.

Frontend build variables:

```text
NEXT_PUBLIC_API_URL=https://api.monstersdna.com
NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID=pa-<site-specific ID from the Plausible installation snippet>
```

`next-plausible` v4 needs the site-specific ID from `https://plausible.io/js/pa-….js` for the **monstersdna.com** site (omit `.js`). This public identifier is not an API key. An empty value disables analytics. A new value requires rebuilding the static frontend; the Docker build also carries it into the Nginx template.

Because Next.js is exported statically, `withPlausibleProxy` rewrites cannot run here. `next-plausible` loads `/js/script.js` and sends pageviews to `/api/event` on `monstersdna.com`; Nginx forwards these to the site-specific script and event API on `p.monstersdna.com`. Browser analytics traffic never needs to contact an external origin. The proxy strips cookies, authorization, and referrer headers; forwards client IPs for aggregate analytics; and does not log analytics requests. Tracking sends only canonical page paths, without query strings, hash fragments, account data, or creature properties. Development tracking is disabled.

After deployment, verify both legal pages, the script response, and same-origin analytics requests from `https://monstersdna.com`. The script is unavailable (503) until a valid ID is supplied. Google/Resend credentials and Plausible site activation must be completed in the relevant provider accounts.
