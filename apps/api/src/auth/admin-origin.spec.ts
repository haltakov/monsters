import request from 'supertest';
import {
  createHarness,
  resetDatabaseStandalone,
  type Harness,
} from '../../test/harness';
import { AuthService } from './auth.service';
import { WorldService } from '../world/world.service';

describe('cookie-authenticated admin write origins', () => {
  let harness: Harness;
  beforeAll(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: false });
    jest.spyOn(harness.app.get(AuthService), 'getSession').mockResolvedValue({
      user: {
        id: 'keeper',
        name: 'Keeper',
        email: 'keeper@example.com',
        image: null,
        role: 'admin',
      },
      session: { id: 'session', expiresAt: new Date(Date.now() + 60_000) },
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await harness.close();
  });

  it.each([
    '/api/admin/monsters',
    '/api/admin/monsters/target/spawn',
    '/api/admin/monsters/target/kill',
    '/api/admin/world/reset',
  ])(
    'blocks cross-origin form POSTs to %s before any mutation',
    async (path) => {
      const state = harness.runner.getState();
      await request(harness.app.getHttpServer() as never)
        .post(path)
        .set('Origin', 'https://untrusted.example')
        .type('form')
        .send({ population: 10 })
        .expect(403);
      expect(harness.runner.getState()).toBe(state);
    },
  );

  it('accepts configured origins and rejects opaque and cross-site requests', async () => {
    const kill = jest
      .spyOn(harness.app.get(WorldService), 'adminKillMonster')
      .mockResolvedValue({} as never);
    const server = harness.app.getHttpServer() as never;
    await request(server)
      .post('/api/admin/monsters/target/kill')
      .set('Origin', 'http://localhost:3100')
      .expect(200);
    await request(server)
      .post('/api/admin/monsters/target/kill')
      .set('Origin', 'null')
      .expect(403);
    await request(server)
      .post('/api/admin/monsters/target/kill')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
