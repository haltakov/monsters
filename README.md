# Monsters

A small 3D monster-world game that a father and son can build together. The first prototype is a single-player island playground with a controllable monster, a third-person camera, and keyboard, mouse, touch, eat, and attack controls.

The island now has 10× the original playable land area, with extended rivers, six bridges, outer hills, and distributed trees, bushes, rocks, and plants.

## Stack

- **Web:** statically exported Next.js, React Three Fiber / Three.js, TypeScript, Tailwind CSS
- **API:** NestJS, TypeScript, Prisma ORM
- **Database:** PostgreSQL
- **Monorepo:** pnpm workspaces

## Start locally

Prerequisites: Node 22+, pnpm 11+, and PostgreSQL.

```bash
createdb monsters
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm db:migrate --name init
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

Walking gradually uses energy, sprinting drains it faster, and every attack costs 7 energy. Eat a nearby bush or tree to recover energy. Reaching zero energy kills the monster; press `R` or use the restart button to try again.

## Monster DNA

The creator exposes 10 deterministic genes: body shape, size, leg count, leg shape, eye count, mouth, body color, accent color, pattern, and horns. The builder and direct DNA field both use the same versioned `M1` codec, and the preview shares its geometry component with the playable monster. A valid DNA string therefore always produces exactly the same creature.

## Project layout

```text
apps/
  web/   Static Next.js game frontend
  api/   NestJS API and Prisma schema
```

The game currently keeps all state in the browser. The API, database schema, migration workflow, CORS setup, and CI are ready for saved worlds and DNA-backed monsters later.

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
