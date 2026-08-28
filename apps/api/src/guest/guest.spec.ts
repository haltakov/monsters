import request from 'supertest';
import { createHarness, resetDatabase, type Harness } from '../../test/harness';
import { hashGuestToken } from './guest.service';

describe('guest identity', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
    await resetDatabase(harness.prisma);
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer() as never;

  it('issues a bearer token and stores only its hash', async () => {
    const response = await request(server())
      .post('/api/guest/bootstrap')
      .expect(201);

    const { token, guest } = response.body as {
      token: string;
      guest: { id: string; displayName: string };
    };
    expect(token).toHaveLength(43);
    expect(guest.displayName.length).toBeGreaterThan(2);

    const row = await harness.prisma.guestPlayer.findUnique({
      where: { id: guest.id },
    });
    expect(row?.tokenHash).toBe(hashGuestToken(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('resumes the same identity with the stored token', async () => {
    const bootstrap = await request(server()).post('/api/guest/bootstrap');
    const { token, guest } = bootstrap.body as {
      token: string;
      guest: { id: string };
    };

    const me = await request(server())
      .get('/api/guest/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((me.body as { guest: { id: string } }).guest.id).toBe(guest.id);
  });

  it('rejects a missing, malformed or unknown token', async () => {
    await request(server()).get('/api/guest/me').expect(401);
    await request(server())
      .get('/api/guest/me')
      .set('Authorization', 'Basic nope')
      .expect(401);
    await request(server())
      .get('/api/guest/me')
      .set('Authorization', 'Bearer not-a-real-token-value')
      .expect(401);
  });

  it('validates display names', async () => {
    const bootstrap = await request(server()).post('/api/guest/bootstrap');
    const { token } = bootstrap.body as { token: string };
    const auth = { Authorization: `Bearer ${token}` };

    await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({})
      .expect(400);
    await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({ displayName: 'a' })
      .expect(400);
    await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({ displayName: 'x'.repeat(200) })
      .expect(400);
    await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({ displayName: `bad${String.fromCharCode(7)}name` })
      .expect(400);
    await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({ displayName: 'Ziggy', extra: 'nope' })
      .expect(400);

    const ok = await request(server())
      .patch('/api/guest/me')
      .set(auth)
      .send({ displayName: '  Captain   Wobble  ' })
      .expect(200);
    expect(
      (ok.body as { guest: { displayName: string } }).guest.displayName,
    ).toBe('Captain Wobble');
  });
});
