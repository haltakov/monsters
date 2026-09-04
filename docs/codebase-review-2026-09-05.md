# MonstersDNA app and server review — 5 September 2026

Reviewed baseline: `9e59e13` (`main`). Fixes are on `codex/codebase-review-fixes`.

## Scope and method

This review follows the main user and server flows through the Next.js app,
NestJS API, shared simulation, Prisma schema, deployment templates and CI:

- Guest bootstrap and storage, account claiming/releasing, ownership and admin authorization.
- Monster creation, copying, selection, spawning, death and archive/lineage reads.
- Socket authentication, joins, takeover, disconnects, input and reconnect behavior.
- Simulation checkpoints, lifecycle persistence, recovery, daily resets and world locks.
- Client state updates, rendering boundaries, portrait caching and resource cleanup.
- Existing regression tests and whether CI actually executes them.

Findings below distinguish fixes covered by regression tests from remaining
code-level findings and improvements that need further measurement or design.
Testing used the dedicated local `monsters_test` database. This review did not
change the production world, run a production load test, or verify OAuth provider
configuration. It is not a complete dependency or penetration-testing audit.

Priority: **P1** = security, data integrity or major gameplay failure;
**P2** = reliability or a feature that fails under specific conditions;
**P3** = maintainability or an improvement that needs measurement.

## Findings addressed in this PR

| ID  | Priority | Finding                                                                      | Result                                                           |
| --- | -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| R1  | P1       | Failed lifecycle writes could be skipped by later checkpoints                | Pause advancement, retry the same batch, deduplicate event rows  |
| R2  | P1       | Most admin writes did not validate browser origins                           | Shared origin check for cookie-authenticated writes              |
| R3  | P1       | Concurrent account claims could assign one device to two competing accounts  | Conditional claim and history transfer in one locked transaction |
| R4  | P1       | Stale asynchronous joins could regain control after leave/disconnect/switch  | Invalidate superseded joins and recheck live connection/world    |
| R5  | P2       | Respawn changed the database while a dead simulation entity blocked spawning | Commit a fresh entity and durable resurrection together          |
| R6  | P2       | Commands could buffer while disconnected and replay on reconnect             | Send gameplay commands only while connected and controlling      |
| R7  | P2       | Storage failures could crash bootstrap or create another guest on retry      | Safe storage access and an in-memory token fallback              |
| R8  | P2       | Simultaneous create/copy calls bypassed the six-monster limit                | Serialize quota check, insertion and selection per device        |
| R9  | P2       | CI never ran the test suites                                                 | PostgreSQL service and `pnpm test` added                         |
| R10 | P2       | HTML proxy errors surfaced as JSON parser errors                             | Preserve the HTTP status in a useful API error                   |

### R1 — Lifecycle persistence must not advance past a failed write

**Location:** [world-runner.service.ts](../apps/api/src/world/world-runner.service.ts),
[world-persistence.service.ts](../apps/api/src/world/world-persistence.service.ts).

**Trigger:** A birth or death occurs, but its database transaction fails. Previously
the runner published the event, logged the save failure and continued ticking.
A later routine checkpoint could persist the newer simulation without replaying
the failed relational updates. A newborn could be present in the snapshot but
absent from the archive; a dead wild monster's row could still say it was alive.

**Fix:** Hold the simulation at a lifecycle transition until its transaction
succeeds. Retry with exponential backoff from one to thirty seconds. Use a stable
batch ID and event index for each event row so a retry after an ambiguous commit
does not duplicate the event log. Publish the batch after the successful save.
Shutdown interrupts backoff and does not write a later checkpoint over an unsaved
transition. Lock loss also wakes the pending retry.

Commands arriving during an ordinary short save are preserved, with movement
coalesced to the latest input and a bounded command queue. After a save failure,
new gameplay commands are refused; disconnect cleanup remains accepted. Joins
wait for the pending commit before selecting the authoritative state.

**Validation:** `critical-recovery.spec.ts` injects a failed write, a committed
transaction whose response is lost, and shutdown during an outage. It verifies
paused ticks, eventual durable death, one event row, delayed publication and no
checkpoint that skips the failure. The complete socket suite also verifies that
movement, attack, pairing and disconnect cleanup survive ordinary saves.

**Tradeoff:** Lifecycle events now wait for database latency. During a sustained
database failure, the world pauses until recovery. Monitor both database latency
and the interval between delivered world updates; the existing tick CPU metric
alone does not include this wait.

### R2 — Apply the admin origin check to every authenticated write

**Location:** [account-auth.guard.ts](../apps/api/src/auth/account-auth.guard.ts),
[admin-monster.controller.ts](../apps/api/src/world/admin-monster.controller.ts).

**Trigger:** A browser with a valid admin session sends a POST from an untrusted
origin. Only the kill endpoint explicitly rejected this. CORS controls access to
responses and does not by itself prevent form POSTs from reaching a controller.
Actual exploitability also depends on browser cookie policy and whether the
origin is a sibling site; the missing server check was directly testable.

**Fix:** Check origins centrally for unsafe methods after account authentication.
Reject untrusted or opaque origins and origin-less requests marked cross-site.
Keep authenticated non-browser clients without an Origin header working.

**Validation:** `admin-origin.spec.ts` covers create, spawn, kill and reset POSTs,
an allowed origin, an opaque origin, and the cross-site fetch metadata fallback.
Existing kill tests continue to cover unauthenticated and non-admin callers.

### R3 — Claim a guest atomically

**Location:** [account.service.ts](../apps/api/src/account/account.service.ts).

**Trigger:** Two accounts claim the same unclaimed device concurrently. The old
code read the device before entering its transaction. Both requests could pass
the check, while the final device owner and the transferred monster history
belonged to different accounts.

**Fix:** Conditionally update and lock the device inside the same transaction as
the history transfer. A competing claimant must satisfy the ownership condition
again after the first commit. Release takes the same device lock before changing
monster ownership; a stale logout cannot release a different account's device.
Repeated claims by the winning account remain idempotent.

**Validation:** `account-race.spec.ts` races two different users, checks that exactly
one succeeds, verifies device/history ownership agrees, repeats the successful
claim, and attempts a stale release. Existing history-transfer tests still pass.

### R4 — Cancel obsolete socket joins

**Location:** [world.gateway.ts](../apps/api/src/world/world.gateway.ts),
[world.service.ts](../apps/api/src/world/world.service.ts).

**Trigger:** An ownership lookup is pending when the player leaves, disconnects,
switches monsters or the world changes. The old handler resumed with its old
session reference and could enqueue another attachment, leaving a monster
controlled by a disconnected socket or returning control to an older choice.

**Fix:** Give each session a join revision; leave, newer joins and reset invalidate
older requests. Recheck the revision, connected socket, active session and world
after asynchronous work. Reject joining a creature that died during the lookup.
Socket lookups no longer overwrite the saved selection as a side effect; REST
selection remains responsible for that write.

**Validation:** `gateway-join-race.spec.ts` uses deferred lookups to exercise leave,
disconnect, out-of-order completion and an unavailable world. The full socket
suite checks normal takeover and switching behavior.

### R5 — Respawn the simulation entity as well as the database row

**Location:** [world.service.ts](../apps/api/src/world/world.service.ts),
[world-runner.service.ts](../apps/api/src/world/world-runner.service.ts),
[engine.ts](../packages/game-core/src/sim/engine.ts).

**Trigger:** Press Spawn on a dead monster while its corpse still exists. The
database was marked alive, but the existing entity prevented a spawn command.
The same database mutation happened before discovering that a runner was stopped.

**Fix:** Route keeper respawns through the same paused, durable mutation path as
keeper kills. Replace a corpse with a fresh, healthy entity, reset its age, and
commit vitals and the recovery snapshot together before swapping the live state.
An already-living entity is a no-op. Ordinary player spawn commands retain their
existing behavior and cannot resurrect a corpse.

**Validation:** Additional `admin-kill.spec.ts` cases cover immediate respawn,
one entity per ID, full vitals, idempotent repeat, restart recovery, database
failure and a stopped runner. Ownership and lineage are preserved.

### R6 — Stop buffering offline commands and clean reconnect state

**Location:** [world-connection.ts](../apps/web/src/lib/net/world-connection.ts),
[game-experience.tsx](../apps/web/src/components/game/game-experience.tsx).

**Trigger:** Input/action methods emitted into Socket.IO while disconnected.
Socket.IO can buffer those calls, producing stale movement, repeated attacks or
rate-limit errors after reconnect. The client also retained authority and a
cached roster after some disconnect paths. Delayed world-unavailable retries
could outlive the selected monster or component that scheduled them.

**Fix:** Require an active connection and current control before sending gameplay
commands. Clear authority on a transport disconnect and clear world state/cache
on explicit disconnect. Only send join/ack packets while connected. Keep one
world-unavailable retry timer and cancel it on a snapshot or effect cleanup.

**Validation:** `world-connection.spec.ts` verifies no offline command emissions,
no commands before control is restored, and complete roster/authority cleanup.
Existing delta, DNA and interpolation tests pass.

### R7 — Keep guest bootstrap working when browser storage is unavailable

**Location:** [session.ts](../apps/web/src/lib/net/session.ts),
[use-session.ts](../apps/web/src/lib/net/use-session.ts).

**Trigger:** Reading `window.localStorage` can itself throw a SecurityError.
Separately, failed writes were swallowed without retaining the new token, so a
retry could create a new identity and disconnect the user from their progress.

**Fix:** Safely obtain browser storage and retain tokens in memory when reading,
writing or clearing persistent storage fails. The guest can continue in that tab.
Persistence across a reload still requires working browser storage.

**Validation:** `session.spec.tsx` covers a throwing storage getter, failed writes,
resuming the same token on retry, and clearing the memory fallback.

### R8 — Enforce the living-monster quota under concurrency

**Location:** [world.service.ts](../apps/api/src/world/world.service.ts).

**Trigger:** With five living monsters, send a create and a copy together. Both
could count five before inserting, exceeding the six-monster limit. Selection
was also updated separately from creation, allowing a partial result on failure.

**Fix:** Use one helper for create/copy. Lock the device row, count the current
living population, insert and update the selected monster in one transaction.
This uses the same lock ordering as account claim/release.

**Validation:** `world-api.spec.ts` races creation and copying for the final slot,
checks one success and one rejection, and verifies the winner is selected.

### R9 — Run the regression suites in CI

**Location:** [ci.yml](../.github/workflows/ci.yml).

**Finding:** The workflow ran lint, typecheck and build but omitted `pnpm test`.
Consequently it could accept changes that broke auth, persistence or gameplay
while still compiling.

**Fix:** Provision PostgreSQL 17 with a readiness check and run the existing
workspace test command. The API test bootstrap creates a separate `_test`
database, migrates it and runs the integration suites there.

### R10 — Preserve useful errors during proxy failures

**Location:** [api-client.ts](../apps/web/src/lib/net/api-client.ts).

**Trigger:** Nginx or another intermediary returns an HTML 502 response. An
unconditional JSON parse previously threw a SyntaxError before the HTTP status
could reach the UI.

**Fix:** Convert malformed responses into `ApiError`, preserve the response status,
and show a readable fallback without including proxy HTML in the message.

**Validation:** `session.spec.tsx` verifies that an HTML 502 becomes an API error
with status 502 rather than an unrelated JSON parser error.

## Remaining findings and recommended follow-up

These are not fixed by this PR. They should remain visible in the backlog.

### F1 — P2: Configure rate-limit client identity for the actual proxy topology

`main.ts` does not set Express `trust proxy`, while the application uses Nest's
default IP-based throttler. Behind a reverse proxy, requests may share the proxy's
address and therefore its guest-bootstrap quota. Verify the address Express sees
in the deployed Coolify route, then trust only the known proxy hops/subnets. Do not
blindly trust arbitrary forwarded headers. Add tests for two genuine clients and
a spoofed forwarded header. No production address trace was collected here, so
the deployment impact is a hypothesis supported by the code configuration.

### F2 — P2: Preserve birth data independently of the final catch-up state

`catchUpWorld` batches lifecycle events across many steps, but
`commitCriticalEvents` looks up each newborn in the final state's entity array.
An animal born and removed during the same catch-up window can have a birth event
without the data required to create its archive row. Carry an immutable birth
record in the event or persist catch-up lifecycle batches before bodies expire.
Add a deterministic test that hatches, kills and removes a baby during one
catch-up operation and still retrieves its DNA and lineage afterward. This is a
code-path finding; that end-to-end catch-up scenario was not executed here.

### F3 — P2: Update simulation ownership when control moves between devices

`selectMonster` can rebind the database `ownerId` to a different guest device for
the same account. An already-live entity retains its old `ownerGuestId`, and
`attach` currently changes only its controller. Offspring and control events can
therefore refer to the earlier device even after a valid transfer. Add a trusted
owner-transfer command and a two-device test including breeding and restart.
Account ownership and device control should remain distinct concepts.

### F4 — P2: Add pagination to the archive and keeper list

`listPublicMonsters` returns the newest 60 records; `adminListMonsters` returns
200, with no cursor. Daily seasons deliberately retain history, so older animals
eventually disappear from the browsable list even though their records exist.
Add cursor pagination with a stable `(createdAt, id)` order and a load-more control.
Index the lineage lookups (`parentAId`, `parentBId`, `clonedFromId`) as history grows.

### F5 — P2: Bound and cancel ordinary REST requests

`apiRequest` accepts a caller-provided AbortSignal, but has no default deadline.
An unresponsive connection can leave a loading state pending indefinitely. Add a
default timeout, preserve explicit cancellation, and use operation IDs so stale
history/search responses cannot overwrite newer results. Mutating requests with
an uncertain result must be reconciled before an automatic retry creates a copy.

### F6 — P3: Measure rendering and simulation cost before further optimization

The renderer already has distance-based detail, mesh promotion budgets and a
shared lazy portrait renderer. Preserve those working constraints. The simulation
still scans resources and other living entities repeatedly; snapshot building
also traverses the world once per connected client. Measure representative
100/300-monster worlds and mobile frame time before deciding whether to add a
spatial index, lower observer update frequency or offload mesh construction.
No browser frame-time profile or production load measurements were collected in
this review, so this is a measurement plan rather than a claimed bottleneck.

### F7 — P3: Separate the large game orchestration and mesh modules

At the reviewed baseline, `game-experience.tsx` was roughly 2,900 lines and
`monster-model.tsx` roughly 2,300. Extract networking lifecycle, input/camera
coordination and agent orchestration behind small interfaces. Separate mesh
construction/cache ownership from animation. Keep DNA/geometry determinism tests
and existing mobile-control regressions in place while moving code.

### F8 — P2: Add database-enforced fencing before expanding to multiple runners

The dedicated advisory-lock connection prevents normal simultaneous runners,
but Prisma writes use another pool. A transaction already queued on that pool
is not intrinsically fenced if the lock connection is lost during a handover.
Before supporting more complex failover, add a monotonically increasing world
epoch and conditional checkpoint/event writes, and test lock loss during a
blocked transaction. The new retry loop checks local lock ownership and stops
on loss, but does not implement database-level epoch fencing.

## Validation and rollout

Local verification covers the API integration suites (74 tests), web suites
(135 tests) and shared core suites (78 tests): **287 tests total**. Fault-injection
tests deliberately log database failures. Lint, typecheck, the API production
build and a Next.js Webpack production export passed locally. Local Turbopack
could not bind its temporary worker port in this execution environment; the
standard `pnpm build` remains unchanged and runs in CI. The PR shows the final CI
status.

No Prisma schema migration or new secret is required. The branch is intended for
review before merging. After merging, verify a guest join/reconnect, account
claim, keeper kill/respawn, archive history and world health. Watch database write
latency and tick delivery around lifecycle events because of R1's save-before-
publish behavior. Database-level fencing, catch-up archival completeness and the
remaining items above are separate follow-up work.
