# Monsters

A small 3D monster-world game that a father and son can build together. The first prototype is a single-player island playground with a controllable monster, a third-person camera, and keyboard, mouse, touch, eat, and attack controls.

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

- `WASD` or arrow keys — move
- Hold `Shift` — sprint
- Move the mouse after clicking the game — look around
- `E` — eat
- `Space` — attack
- `Esc` — release the mouse
- Touchscreen — twin virtual sticks and action buttons

The player cannot enter the sea or river. Cross the river using one of the log bridges.

## Project layout

```text
apps/
  web/   Static Next.js game frontend
  api/   NestJS API and Prisma schema
```

The game currently keeps all state in the browser. The API, database schema, migration workflow, CORS setup, and CI are ready for saved worlds and DNA-backed monsters later.
