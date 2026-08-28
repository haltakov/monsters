#!/usr/bin/env node
/**
 * Multiplayer load / smoke harness.
 *
 * Connects N Socket.IO clients to a running API, gives each one a monster and
 * drives it at the real client input rate, then reports tick lag, message
 * rate, errors and API memory.
 *
 * Usage:
 *   pnpm --filter @monsters/api loadtest -- --clients=20 --seconds=180
 *
 * To validate the 100-monster target, seed a fresh world with
 * `WORLD_SEED_POPULATION=100` before starting the API.
 */
import { io } from 'socket.io-client';
import { encodeMonsterDna, DEFAULT_MONSTER_DNA } from '@monsters/game-core';

function arg(name, fallback) {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

const BASE_URL = arg('url', process.env.API_URL ?? 'http://127.0.0.1:3101');
const CLIENTS = Number(arg('clients', '20'));
const SECONDS = Number(arg('seconds', '120'));
const INPUT_HZ = Number(arg('inputHz', '10'));
const DNA = encodeMonsterDna(DEFAULT_MONSTER_DNA);

const stats = {
  deltas: 0,
  bytes: 0,
  errors: [],
  connects: 0,
  disconnects: 0,
  tickGaps: [],
};

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status}`);
  }
  return response.json();
}

async function createPlayer(index) {
  const { token } = await api('/api/guest/bootstrap', { method: 'POST' });
  const auth = { Authorization: `Bearer ${token}` };
  const { monster } = await api('/api/monsters', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: `Load ${index + 1}`, dna: DNA }),
  });
  return { token, monsterId: monster.id };
}

function spawnClient({ token, monsterId }, index) {
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    auth: { token, protocolVersion: 1 },
    forceNew: true,
    reconnection: true,
  });

  let lastTick = 0;
  let seq = 0;
  let heading = (index / CLIENTS) * Math.PI * 2;

  socket.on('connect', () => {
    stats.connects += 1;
    socket.emit('world:join', { monsterId });
  });
  socket.on('disconnect', () => {
    stats.disconnects += 1;
  });
  socket.on('world:error', (error) => stats.errors.push(error));
  socket.on('world:delta', (delta) => {
    stats.deltas += 1;
    stats.bytes += JSON.stringify(delta).length;
    if (lastTick && delta.tick - lastTick > 1) {
      stats.tickGaps.push(delta.tick - lastTick);
    }
    lastTick = delta.tick;
  });

  const inputTimer = setInterval(() => {
    if (!socket.connected) return;
    seq += 1;
    heading += 0.05;
    socket.emit('world:input', {
      seq,
      forward: 1,
      strafe: Math.sin(heading) * 0.4,
      turn: 0,
      heading,
      sprint: seq % 20 < 5,
    });
  }, 1000 / INPUT_HZ);

  const actionTimer = setInterval(() => {
    if (!socket.connected) return;
    socket.emit('world:action', { action: seq % 2 ? 'eat' : 'attack' });
  }, 3000);

  return () => {
    clearInterval(inputTimer);
    clearInterval(actionTimer);
    socket.close();
  };
}

async function main() {
  console.log(
    `Load test: ${CLIENTS} clients against ${BASE_URL} for ${SECONDS}s`,
  );
  const before = await api('/api/health');
  console.log(
    `World before: tick=${before.worldRunner.tick} living=${before.worldRunner.livingEntities} rss=${before.process.rssMb}MB`,
  );
  if (!before.worldRunner.ownsWorld) {
    throw new Error('That API instance does not own the world; start one that does.');
  }

  const players = [];
  for (let index = 0; index < CLIENTS; index += 1) {
    players.push(await createPlayer(index));
  }
  const stopFns = players.map((player, index) => spawnClient(player, index));

  const startedAt = Date.now();
  const samples = [];
  const sampler = setInterval(async () => {
    try {
      const health = await api('/api/health');
      samples.push({
        tick: health.worldRunner.tick,
        living: health.worldRunner.livingEntities,
        connections: health.worldRunner.connections,
        tickMs: health.worldRunner.lastTickDurationMs,
        dropped: health.worldRunner.droppedTicks,
        rssMb: health.process.rssMb,
      });
    } catch (error) {
      stats.errors.push({ code: 'healthFailed', message: String(error) });
    }
  }, 5000);

  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
  clearInterval(sampler);
  for (const stop of stopFns) stop();

  const elapsed = (Date.now() - startedAt) / 1000;
  const after = await api('/api/health');
  const last = {
    tick: after.worldRunner.tick,
    living: after.worldRunner.livingEntities,
    connections: after.worldRunner.connections,
    tickMs: after.worldRunner.lastTickDurationMs,
    dropped: after.worldRunner.droppedTicks,
    rssMb: after.process.rssMb,
  };
  samples.push(last);
  const expectedTicks = elapsed * 10;
  const actualTicks = (last.tick ?? 0) - before.worldRunner.tick;

  console.log('\n--- results ---');
  console.log(`duration:          ${elapsed.toFixed(1)}s`);
  console.log(`clients:           ${CLIENTS} (connects=${stats.connects} disconnects=${stats.disconnects})`);
  console.log(`living monsters:   ${last.living ?? 'n/a'}`);
  console.log(`socket connections:${last.connections ?? 'n/a'}`);
  console.log(
    `ticks advanced:    ${actualTicks} of ~${Math.round(expectedTicks)} expected (${(
      (actualTicks / expectedTicks) * 100
    ).toFixed(1)}%)`,
  );
  console.log(`dropped ticks:     ${last.dropped ?? 0}`);
  console.log(`slowest tick seen: ${Math.max(0, ...samples.map((s) => s.tickMs ?? 0)).toFixed(2)}ms`);
  console.log(
    `delta messages:    ${stats.deltas} (${(stats.deltas / elapsed).toFixed(1)}/s, ${(
      stats.bytes /
      elapsed /
      1024
    ).toFixed(1)} KiB/s)`,
  );
  console.log(
    `batched publishes: ${stats.tickGaps.length} (a publish covering more than one tick)`,
  );
  console.log(`api memory:        ${last.rssMb ?? 'n/a'} MB rss`);
  console.log(`protocol errors:   ${stats.errors.length}`);
  for (const error of stats.errors.slice(0, 5)) {
    console.log(`  - ${error.code}: ${error.message}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
