# Monsters

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

## Project layout

```text
apps/
  web/   Static Next.js game frontend
  api/   NestJS API and Prisma schema
packages/
  game-core/  Pure deterministic DNA, terrain, protocol, and simulation logic
```

PostgreSQL stores anonymous guest identities, owned monsters, lineage, semantic lifecycle events, and the latest recoverable world checkpoint. The API holds hot simulation state in memory, checkpoints it at least every 15 seconds, and uses a dedicated PostgreSQL advisory lock so only one API container can advance the world during a rolling deployment. Player movement is predicted locally for responsiveness; health, energy, combat, AI, mating, eggs, and death remain authoritative on the server.

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
WEB_ORIGIN=https://monsters.haltakov.com
PORT=3000
```

The frontend health endpoint is `/healthz`; the API health endpoint is `/api/health` and verifies its database connection.
