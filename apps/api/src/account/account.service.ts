import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async claimGuest(guestId: string, userId: string) {
    const guest = await this.prisma.guestPlayer.findUniqueOrThrow({
      where: { id: guestId },
    });
    if (guest.userId && guest.userId !== userId) {
      throw new ForbiddenException(
        'This local profile is already attached to another account',
      );
    }
    const [claimed] = await this.prisma.$transaction([
      this.prisma.monster.updateMany({
        where: { ownerId: guestId, accountOwnerId: null },
        data: { accountOwnerId: userId },
      }),
      this.prisma.guestPlayer.update({
        where: { id: guestId },
        data: { userId },
      }),
    ]);
    return { claimedMonsters: claimed.count };
  }

  async releaseGuest(guestId: string, userId: string) {
    const memberships = await this.prisma.worldMember.findMany({
      where: { guestId },
      select: { selectedMonsterId: true },
    });
    const selectedIds = memberships
      .map((membership) => membership.selectedMonsterId)
      .filter((id): id is string => Boolean(id));
    await this.prisma.$transaction([
      this.prisma.monster.updateMany({
        where: {
          ownerId: guestId,
          accountOwnerId: userId,
          ...(selectedIds.length > 0 ? { id: { notIn: selectedIds } } : {}),
        },
        data: { ownerId: null },
      }),
      this.prisma.guestPlayer.updateMany({
        where: { id: guestId, userId },
        data: { userId: null },
      }),
    ]);
    return { released: true };
  }
}
