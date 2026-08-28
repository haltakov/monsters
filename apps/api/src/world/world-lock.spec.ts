import { WorldLockService, worldLockKey } from './world-lock.service';

describe('world advisory lock', () => {
  const slug = 'lock-test-world';

  it('derives a stable signed int4 key from a slug', () => {
    expect(worldLockKey(slug)).toBe(worldLockKey(slug));
    expect(worldLockKey(slug)).not.toBe(worldLockKey('other'));
    expect(Number.isInteger(worldLockKey(slug))).toBe(true);
    expect(worldLockKey(slug)).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(worldLockKey(slug)).toBeLessThan(2 ** 31);
  });

  it('lets exactly one process own a world and hands over after release', async () => {
    const first = new WorldLockService();
    const second = new WorldLockService();

    expect(await first.acquire(slug)).toBe(true);
    expect(first.isOwned).toBe(true);
    expect(await first.verify(slug)).toBe(true);

    // A second process during a rolling deploy must be refused.
    expect(await second.acquire(slug)).toBe(false);
    expect(second.isOwned).toBe(false);

    await first.release(slug);
    expect(first.isOwned).toBe(false);

    expect(await second.acquire(slug)).toBe(true);
    expect(await second.verify(slug)).toBe(true);
    await second.release(slug);
  });

  it('reports loss when the owning connection goes away', async () => {
    const lock = new WorldLockService();
    const lost = jest.fn();
    lock.onLost(lost);
    expect(await lock.acquire(slug)).toBe(true);

    await lock.release(slug);
    expect(lock.isOwned).toBe(false);
    // A released lock is immediately grabbable by a fresh process.
    const next = new WorldLockService();
    expect(await next.acquire(slug)).toBe(true);
    await next.release(slug);
  });

  it('verify is false once the lock has been released', async () => {
    const lock = new WorldLockService();
    await lock.acquire(slug);
    await lock.release(slug);
    expect(await lock.verify(slug)).toBe(false);
  });
});
