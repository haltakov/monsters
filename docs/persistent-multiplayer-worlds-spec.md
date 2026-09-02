# Persistent Multiplayer Worlds — Implementation Specification

## 1. Purpose

Implement stages 1–4 of the persistent multiplayer plan for MonstersDNA:

1. Extract a deterministic, server-compatible simulation engine.
2. Add a persistent, continuously running world backed by PostgreSQL checkpoints.
3. Add authoritative real-time multiplayer for multiple browser clients.
4. Move the complete ecosystem—AI, feeding, combat, health, mating, mutations,
   eggs, aging, and death—to the server.

This is an implementation task, not a prototype or architecture-only exercise.
The result must work locally, pass automated tests, build production images, and
be ready for a reviewed production rollout.

Do not commit, push, deploy, modify Coolify, or touch any other project. The
lead agent will review and perform those operations after the implementation is
complete.

## 2. Existing System

- pnpm TypeScript monorepo.
- `apps/web`: statically exported Next.js frontend using React Three Fiber and
  Three.js. The complete simulation currently lives primarily inside
  `game-experience.tsx` and `monster-simulation.ts` and runs in the browser.
- `apps/api`: NestJS 11 API, Prisma 7, and PostgreSQL. It currently exposes only
  a welcome endpoint and a database-backed health endpoint.
- Production resources already exist in the MonstersDNA Coolify project:
  frontend, one API instance, and PostgreSQL.
- Production frontend and API domains are:
  `https://monsters.haltakov.com` and
  `https://monsters-api.haltakov.com`.
- Coolify uses rolling deployments, which may briefly overlap old and new API
  processes even though the desired steady state is one API instance.
- Current game behavior, controls, monster creator, deterministic DNA visuals,
  smooth meshes, desktop UI, and simplified mobile HUD must remain functional.

Read all repository instructions before editing. In particular, obey
`apps/web/AGENTS.md` for any Next.js-specific work.

## 3. Product Decisions — Treat as Requirements

### World

- Implement one permanent public world for now.
- Multiple player-created worlds are explicitly out of scope, but the schema
  and runner API must not prevent adding them later.
- The public world is seeded idempotently on API startup.
- It starts with ten deterministic wild monsters using the existing archetypes
  and deterministic DNA system.

### Identity

- No account/login/password system yet.
- Use anonymous, device-bound guest profiles.
- The server issues a cryptographically random bearer token once.
- Store only a secure hash of the token in PostgreSQL; never store the raw token.
- The web client keeps the raw token in local storage and reuses it on return.
- A guest has a server-generated safe default display name that can be changed
  through a validated endpoint.
- Names must be trimmed, length-limited, and contain no control characters.

### Player monsters

- A guest can own multiple monsters but controls at most one in the world at a
  time.
- Monster identity, name, DNA, ownership, lineage, generation, and alive/dead
  status persist.
- The existing creator must create and edit owned monsters through the server.
- A monster's DNA remains deterministic: the same DNA produces exactly the same
  visuals on every client.
- On disconnect, the player's monster remains in the world and returns to AI
  control after a short grace period (approximately 10–15 seconds).
- Offline monsters remain mortal. If an owned monster dies, death persists and
  the guest may create/select another monster.

### Interaction and safety

- AI monsters can attack AI monsters and players using the existing ecosystem
  rules.
- Players can attack AI monsters.
- Player actions must not damage another currently player-controlled monster in
  this release. Return a clear no-op/result rather than trusting the client.
- Pairing with an AI monster follows the existing readiness and cooldown rules.
- Pairing between two currently player-controlled monsters requires explicit
  acceptance by the second player and expires after a short timeout.
- No chat system.

### Capacity and timing targets

- Design target: 20 simultaneous players and 100 living monsters in the public
  world. This is a target to validate through load tests, not an unsupported
  guarantee.
- Authoritative simulation: fixed 10 Hz tick while the world runner is active.
- Network state publication: approximately 10 Hz, using compact deltas or
  interest-filtered snapshots rather than uncontrolled per-frame messages.
- Rendering remains client-side at display frame rate with interpolation.
- PostgreSQL is never used as the per-tick movement engine.

## 4. Architectural Requirements

### 4.1 Shared pure game core

Create a proper workspace package, preferably `packages/game-core` with package
name `@monsters/game-core`, containing browser-independent logic:

- Monster DNA types, deterministic codec, trait constants, archetype data, and
  genetic mixing logic needed by both applications.
- World terrain/water/bridge boundary calculations used for authoritative
  movement validation.
- Simulation entity types.
- Deterministic seeded random-number generation.
- Fixed-step simulation reducer/engine.
- Player input and action command types.
- Serializable world snapshot and event types.
- Protocol message payload types shared by API and web.

The package must not import React, React Three Fiber, Three.js, NestJS, Prisma,
DOM APIs, or Node-only APIs. Use ordinary TypeScript math. Visual-only geometry
and materials stay in the web app.

Preserve compatibility for existing web imports with thin re-export modules
when that reduces risk. Do not duplicate competing DNA definitions between web
and server.

### 4.2 Deterministic simulation

The simulation engine must:

- Advance via an explicit fixed `dt`, never `Date.now()` or animation-frame
  timing internally.
- Receive seeded random state explicitly and persist whatever is needed to
  resume deterministically.
- Be serializable without class instances, maps, sets, vectors, or circular
  references in the stored snapshot.
- Simulate walking/steering, habitat boundaries, energy consumption, health
  regeneration, feeding, resource cooldown/regeneration, social behavior,
  hunting, defense, damage, death, mating, cooldowns, genetic mixing, mutation,
  eggs, hatching, aging, and offline AI control.
- Represent player-controlled monsters as entities using externally supplied
  input; disconnected/AI entities use objective-driven behavior.
- Validate movement against world boundaries and water capability.
- Emit semantic events for attacks, feeding, pairing requests/results, eggs,
  hatching, births, deaths, connection ownership changes, and notable errors.
- Cap large catch-up intervals and provide a documented coarse catch-up method
  for API downtime so startup cannot spend minutes replaying tiny ticks.
- Never depend on render interpolation or mesh state.

### 4.3 Server-authoritative world runner

Add a NestJS world module with a `WorldRunner`/`WorldRuntime` abstraction:

- Load the public world's latest checkpoint and durable identities.
- Acquire exclusive simulation ownership before starting.
- Tick at 10 Hz using monotonic elapsed time and a bounded accumulator.
- Apply validated queued player inputs in sequence order.
- Publish network state at approximately 10 Hz.
- Checkpoint at least every 15 seconds.
- Trigger an immediate transactional checkpoint for critical transitions:
  monster creation, DNA edit, ownership change, egg creation, hatch/birth, and
  death.
- Perform a final best-effort checkpoint on graceful application shutdown.
- Restore safely after an unclean shutdown.
- Advance downtime through bounded/coarse catch-up using the checkpoint's
  `simulatedAt` value.
- Expose runner health: owns lock, current tick, last tick time, last checkpoint
  time, connection count, and entity count.

Do not use Redis, Kafka, a second service, worker threads, or microservices in
this release.

### 4.4 Single-owner locking

Prevent duplicate simulation during Coolify rolling deploy overlap:

- Use a PostgreSQL advisory lock held by a dedicated `pg` connection for the
  lifetime of a running world, or an equivalently robust database lease.
- Prefer advisory locking because the project already decided on it.
- If the lock is unavailable, the new process must remain healthy enough for
  deployment diagnostics but must not tick or write that world concurrently.
- It should retry takeover with bounded backoff.
- A dropped database connection or terminated process must release ownership.
- Surface lock state through health/diagnostics.

### 4.5 Persistence strategy

PostgreSQL is a recovery and durable-facts store, not a hot state loop.

Add an additive Prisma migration. Preserve existing `World` and `Monster` data
where practical. The exact schema may be improved during implementation, but it
must model at least:

- `GuestPlayer`: id, token hash, display name, timestamps, last seen.
- `World`: existing identity plus public/status/settings, current tick or
  snapshot reference, and timestamps.
- `WorldMember`: guest/world membership and selected/controlled monster.
- `Monster`: durable identity, world, owner (nullable), name, deterministic DNA,
  lineage/parents, generation, alive/dead state, and timestamps.
- `WorldSnapshot`: one latest authoritative recovery snapshot per world,
  version, simulation tick, `simulatedAt`, serialized state, timestamps.
- `WorldEvent`: append-only semantic history with tick, type, payload, and
  timestamp. It is for history/diagnostics and need not be full event sourcing.

Runtime coordinates, velocities, vitals, intents, resource state, eggs, and
cooldowns belong in the serialized snapshot. Durable monster rows must be kept
consistent at critical lifecycle transitions. A critical transition should
atomically update its relational facts, event record, and recovery snapshot so
it cannot disappear after a crash.

Use JSON/JSONB only for versioned structured data such as DNA, protocol-neutral
snapshot state, settings, and event payloads. Validate stored snapshot versions
when loading. Fail clearly on unsupported future versions.

### 4.6 REST API

Use versionable DTOs, validation, explicit response shapes, and sensible status
codes. At minimum provide equivalents for:

- Bootstrap/resume guest identity with bearer token.
- Read/update the current guest profile.
- Read public world metadata.
- Read the initial authoritative world snapshot for reconnect/bootstrap.
- List the guest's owned monsters.
- Create an owned monster from validated name and DNA.
- Edit an owned monster's name/DNA when allowed.
- Select which owned living monster to control.

Do not expose Prisma objects or token hashes directly. Authenticate both REST
and WebSocket access with the guest token. Add rate limiting appropriate for a
small public prototype without introducing Redis.

### 4.7 WebSocket protocol

Use NestJS WebSocket support with Socket.IO unless a concrete repository
constraint makes plain `ws` materially better. Configure CORS for local and
production web origins.

Required client-to-server semantics:

- authenticate in the connection handshake;
- join/leave the public world;
- send sequenced movement input at a bounded rate;
- send discrete actions: eat, attack, pair, fly/land, dive/surface;
- request/respond to player pairing;
- acknowledge the last server state received when useful;
- reconnect and resynchronize without duplicating ownership.

Required server-to-client semantics:

- authoritative initial snapshot;
- state updates/deltas with server tick and time;
- lifecycle and action-result events;
- connection/ownership status;
- pairing request, acceptance, rejection, expiry, and result;
- clear structured errors for invalid/stale/rate-limited commands.

Clamp axes, reject malformed payloads, reject stale/out-of-order input
sequences, enforce cooldowns, and never trust client-reported position, health,
energy, damage, age, DNA mutation results, or pairing results.

### 4.8 Client networking and rendering

Replace the browser-owned ecosystem with server state while preserving game
feel and existing visuals:

- Bootstrap/resume the guest session on game entry.
- Connect to the production/local API using an explicit public environment
  variable with a safe local default. Derive WebSocket configuration correctly
  for HTTPS/WSS production.
- Join the public world and select/create a player monster.
- Send normalized input commands, not position updates.
- Render authoritative wild and remote-player monsters from network state.
- Interpolate remote entities with a small render delay to hide 10 Hz updates.
- Use local prediction for the controlled monster and reconcile smoothly to
  authoritative snapshots. Avoid visible teleporting for small corrections;
  snap only for large invalid divergence or respawn.
- The server is authoritative for player health, energy, actions, death,
  cooldowns, eggs, and population counts.
- Preserve keyboard, mouse, arrow, mobile joystick, eat, attack, pair,
  flight/dive, creator, language, mobile HUD, and third-person camera behavior.
- Keep the existing smooth-mesh gait animation driven by interpolated rendered
  movement for all remote monsters.
- Add a compact connection/reconnecting indicator and an actionable error state.
- Add UI for incoming player pairing requests with accept/decline and expiry.
- Do not add chat.
- Avoid loading the heavy 3D game before REST/session bootstrap has a clear
  loading state.

The frontend is statically exported. Ensure Docker build-time environment
variables provide the production API base URL without hardcoding production in
source. Local development must work with the existing ports.

### 4.9 Interest management and bandwidth

For the 20-player/100-monster target:

- Do not emit one Socket.IO event per entity per tick.
- Batch updates by world and tick.
- Send only fields that changed or use compact snapshots with documented
  filtering.
- Prefer spatial interest filtering around each controlled monster plus global
  lifecycle/population events.
- Ensure entities entering interest receive a complete state and entities
  leaving interest are explicitly removed/hidden.
- Include enough state for deterministic visual DNA and interpolation.

Keep the implementation understandable; do not introduce binary protocols
unless profiling demonstrates a need.

## 5. Detailed Behavioral Requirements

### Movement

- Server applies the agreed controls semantically: W/S and arrow up/down move
  forward/back; arrow left/right turn character and camera intent; A/D move in
  camera-relative left/right directions while facing movement; mouse look stays
  client camera-only until movement aligns the monster.
- Network protocol may represent normalized forward/strafe plus desired heading.
- Server validates speed, sprint energy drain, habitat, flight/swim capability,
  and world radius.

### Energy and health

- Walking drains energy; sprinting, flying/swimming as applicable, and attacks
  drain more.
- Eating compatible nearby resources restores energy.
- Zero energy or health kills the monster.
- Health regenerates after avoiding damage, with higher energy increasing the
  recovery rate.
- All values and results come from the server.

### AI

- Preserve objective-based behavior: feed, survive, defend, hunt, mate, wander,
  avoid or approach others according to social DNA.
- Solitary monsters prefer distance; pairs prefer one similar companion; packs
  and armies prefer increasingly larger similar groups.
- Behavior should be weighted and emergent, not a rigid state machine that
  ignores competing needs.
- Offline owned monsters use the same AI rules.

### Mating and genetics

- Readiness requires suitable health, energy, adult age, distance, and cooldown.
- AI/AI and player/AI mating may complete when server rules allow.
- Player/player mating requires consent from both connected owners.
- DNA inheritance chooses genes from each parent and applies deterministic
  seeded mutation probabilities using the existing genetic system.
- Egg creation persists immediately; hatch timing continues without clients.
- Babies preserve parent IDs, generation, and mutation count and grow from
  juvenile to adult.

### Death and reconnect

- Death is durable and produces a lifecycle event.
- A dead controlled monster stops accepting movement/actions.
- Its owner can select another living owned monster or create a new one.
- Reconnect must not create duplicate player entities or duplicate inputs.
- Multiple tabs using one token may observe, but only one live socket should be
  the active controller for a selected monster. Use a deterministic takeover or
  rejection rule and expose it to the UI.

## 6. Testing Requirements

Add meaningful automated coverage, not only happy-path compilation.

### Pure core tests

- Same seed + inputs produce identical snapshots/events.
- Different chunking of elapsed frame time yields the same fixed-tick result.
- Movement speed and water/world-boundary validation.
- Energy drain, feeding, attack costs, damage, recovery, and death.
- AI hunger/threat/social objective selection.
- Pairing readiness/cooldown.
- Genetic inheritance and deterministic mutation.
- Egg persistence/hatching and juvenile growth.
- Disconnected player entity returning to AI.
- Snapshot serialize/deserialize/version validation.
- Coarse offline catch-up is bounded and deterministic for the same inputs.

### API tests

- Guest bootstrap and token hashing/authentication.
- Invalid/missing token rejection.
- Name and DNA validation.
- Ownership authorization for create/edit/select.
- Idempotent public-world seeding.
- Checkpoint write/load and critical transactional persistence.
- Advisory-lock single ownership and takeover after release.
- Health response includes world-runner status.

### WebSocket integration tests

- Two authenticated clients join and receive consistent snapshots.
- Sequenced input moves only the owned entity.
- Invalid speed/state injection is impossible through protocol payloads.
- Out-of-order/rate-limited inputs are rejected safely.
- Disconnect/reconnect resumes the same entity.
- Only one controller owns a monster at a time.
- Player attack cannot damage another controlled player.
- Player/AI combat works.
- Player/player pairing requires acceptance and expires/rejects correctly.

### Web tests

- Session bootstrap loading/error/retry.
- Network snapshot mapping and interpolation helpers.
- Controlled-player reconciliation logic.
- Creator create/edit calls use server ownership and handle validation failures.
- Pairing request UI.
- Connection/reconnection status.

### Load/smoke test

Add a repeatable script that can simulate 20 Socket.IO clients and a 100-monster
world for several minutes, reporting tick lag, message rate, errors, and process
memory. It need not run in every default unit-test invocation but must be
documented and runnable locally.

## 7. Quality Gates

All existing and new checks must pass:

- dependency installation/lockfile consistency;
- lint for every workspace;
- TypeScript typecheck for every workspace;
- unit and integration tests;
- production builds for web, API, and shared packages;
- Prisma generation and migration validation;
- Docker image builds for `Dockerfile.app` and `Dockerfile.server` when the
  local environment supports them;
- no unhandled browser console errors in a local smoke test;
- no secrets committed;
- `git diff --check` clean.

Do not weaken existing lint, TypeScript, tests, security, or health checks to
make the implementation pass.

## 8. Local Developer Experience

- Preserve the existing `pnpm dev` experience.
- Document PostgreSQL migration/setup and any new environment variables.
- Add scripts for migration, seeding if needed, tests, and the multiplayer load
  smoke test.
- Provide `.env.example` values for local API/web origins without secrets.
- Ensure a fresh checkout can install, migrate, start API/web, and create/resume
  the public world using documented steps.

## 9. Production Readiness and Rollout Notes

Prepare but do not execute deployment.

- Migration must be additive and safe against the currently nearly empty
  production schema.
- API should tolerate frontend clients from the immediately previous version
  during rolling rollout or return a clear version error.
- WebSocket traffic must work through the existing Coolify/Traefik HTTPS domain.
- Docker API startup must still apply Prisma migrations before Nest starts.
- Frontend image must receive the production public API URL at build time.
- Health checks must not claim the world runner owns the world when it does not.
- Document the safe deployment order: database migration/API, verify runner and
  WebSocket, then frontend.
- Document rollback implications once the authoritative world has advanced.

## 10. Explicit Non-Goals

- Multiple user-created/private worlds.
- Registered accounts, email, passwords, OAuth, or payments.
- Chat, voice, moderation tooling, or social messaging.
- PvP damage between currently controlled player monsters.
- Redis, Kafka, Kubernetes, microservices, horizontal API scaling, or a second
  simulation service.
- Binary network protocol.
- Replacing Three.js/React Three Fiber or redesigning monster visuals.
- Reworking unrelated landing-page UI.

## 11. Definition of Done

The work is complete only when all of the following are demonstrated locally:

1. The server owns and continuously advances the public world without a browser.
2. World state survives an API restart and advances through downtime.
3. Two independent browser sessions join as separate guests, control separate
   monsters, and see smooth authoritative movement and shared ecosystem state.
4. Closing one client returns its monster to AI; reconnecting resumes the same
   guest and monster without duplication.
5. AI feeding, combat, health recovery, mating, mutation, eggs, hatching, aging,
   and death all run server-side and persist correctly.
6. Player actions cannot forge position/vitals/damage or harm another actively
   controlled player monster.
7. Player/player pairing requires explicit acceptance.
8. Existing desktop/mobile controls, creator, DNA visuals, languages, and HUD
   remain usable.
9. Automated tests and all quality gates pass.
10. The implementation includes a concise architecture/operations document and
    a list of any known limitations or deferred risks.

## 12. Implementation Conduct

- Inspect the current code deeply before changing it.
- Keep a clear implementation checklist and work through it in dependency order.
- Prefer cohesive modules and pure functions over expanding
  `game-experience.tsx` further.
- Preserve unrelated user changes and do not perform destructive git operations.
- Do not commit, push, deploy, or access production systems.
- If a requirement proves contradictory or unsafe, stop and explain the exact
  conflict and the best alternative. Otherwise make reasonable implementation
  decisions and document them.
- At completion, report:
  - architecture implemented;
  - files/modules added or substantially changed;
  - migrations and environment variables;
  - tests and commands run with results;
  - manual two-client validation performed;
  - remaining limitations/risks;
  - exact recommended review and deployment steps for the lead agent.
