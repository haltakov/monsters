import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async claimGuest(guestId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock and conditionally claim the device before transferring its monsters.
      // PostgreSQL rechecks this predicate after a competing claimant commits.
      const attached = await tx.guestPlayer.updateMany({
        where: { id: guestId, OR: [{ userId: null }, { userId }] },
        data: { userId },
      });
      if (attached.count !== 1) {
        throw new ForbiddenException(
          'This local profile is already attached to another account',
        );
      }
      const claimed = await tx.monster.updateMany({
        where: { ownerId: guestId, accountOwnerId: null },
        data: { accountOwnerId: userId },
      });
      return { claimedMonsters: claimed.count };
    });
  }

  async releaseGuest(guestId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const detached = await tx.guestPlayer.updateMany({
        where: { id: guestId, userId },
        data: { userId: null },
      });
      if (detached.count === 0) return { released: true };
      const memberships = await tx.worldMember.findMany({
        where: { guestId },
        select: { selectedMonsterId: true },
      });
      const selectedIds = memberships
        .map((membership) => membership.selectedMonsterId)
        .filter((id): id is string => Boolean(id));
      await tx.monster.updateMany({
        where: {
          ownerId: guestId,
          accountOwnerId: userId,
          ...(selectedIds.length > 0 ? { id: { notIn: selectedIds } } : {}),
        },
        data: { ownerId: null },
      });
      return { released: true };
    });
  }
}
