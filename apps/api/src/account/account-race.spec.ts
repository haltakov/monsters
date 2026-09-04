import { ForbiddenException } from '@nestjs/common';
import { DEFAULT_MONSTER_DNA, encodeMonsterDna } from '@monsters/game-core';
import {
  createHarness,
  resetDatabaseStandalone,
  type Harness,
} from '../../test/harness';
import { AccountService } from './account.service';
import { GuestService } from '../guest/guest.service';
import { WorldService } from '../world/world.service';

describe('atomic account claims', () => {
  let harness: Harness;
  beforeAll(async () => {
    await resetDatabaseStandalone();
    harness = await createHarness({ runner: true, listen: false });
  });
  afterAll(async () => {
    await harness.close();
  });

  it('allows only one of two accounts racing to claim the same local history', async () => {
    const { guest } = await harness.app.get(GuestService).bootstrap();
    const monster = await harness.app
      .get(WorldService)
      .createMonster(
        guest.id,
        'Concurrent claim',
        encodeMonsterDna(DEFAULT_MONSTER_DNA),
      );
    await harness.prisma.user.createMany({
      data: ['first', 'second'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
      })),
    });
    const accounts = harness.app.get(AccountService);
    const results = await Promise.allSettled([
      accounts.claimGuest(guest.id, 'first'),
      accounts.claimGuest(guest.id, 'second'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(
      ForbiddenException,
    );
    const device = await harness.prisma.guestPlayer.findUniqueOrThrow({
      where: { id: guest.id },
    });
    const owned = await harness.prisma.monster.findUniqueOrThrow({
      where: { id: monster.id },
    });
    expect(owned.accountOwnerId).toBe(device.userId);
    await expect(
      accounts.claimGuest(guest.id, device.userId!),
    ).resolves.toEqual({ claimedMonsters: 0 });
    // A stale logout from the losing account cannot release the winner's device.
    await accounts.releaseGuest(
      guest.id,
      device.userId === 'first' ? 'second' : 'first',
    );
    expect(
      (
        await harness.prisma.guestPlayer.findUniqueOrThrow({
          where: { id: guest.id },
        })
      ).userId,
    ).toBe(device.userId);
  });
});
