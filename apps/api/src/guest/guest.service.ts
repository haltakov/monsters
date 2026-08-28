import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRandomName, createSeededRandom } from '@monsters/game-core';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeDisplayName } from '../common/validation';

export type GuestProfile = {
  id: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
};

export type GuestRecord = {
  id: string;
  displayName: string;
  createdAt: Date;
  lastSeenAt: Date;
};

/**
 * The raw bearer token is returned exactly once and never stored. Only its
 * SHA-256 digest reaches PostgreSQL, so a database leak cannot be replayed as
 * a login. The token itself is 256 bits of CSPRNG output, which is why a plain
 * digest (rather than a slow password hash) is appropriate here.
 */
export function hashGuestToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createGuestToken() {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class GuestService {
  constructor(private readonly prisma: PrismaService) {}

  toProfile(guest: GuestRecord): GuestProfile {
    return {
      id: guest.id,
      displayName: guest.displayName,
      createdAt: guest.createdAt.toISOString(),
      lastSeenAt: guest.lastSeenAt.toISOString(),
    };
  }

  private generateDisplayName() {
    const random = createSeededRandom(randomBytes(4).readUInt32BE(0));
    return createRandomName(random);
  }

  async bootstrap() {
    const token = createGuestToken();
    const guest = await this.prisma.guestPlayer.create({
      data: {
        tokenHash: hashGuestToken(token),
        displayName: this.generateDisplayName(),
      },
    });
    return { token, guest };
  }

  /** Returns the guest for a raw bearer token, or throws 401. */
  async authenticate(token: string | undefined | null) {
    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new UnauthorizedException('A guest bearer token is required');
    }
    const tokenHash = hashGuestToken(token);
    const guest = await this.prisma.guestPlayer.findUnique({
      where: { tokenHash },
    });
    if (!guest) {
      throw new UnauthorizedException('Unknown or expired guest token');
    }
    // Constant-time comparison of the digests keeps the lookup uniform even
    // though the unique index already did the matching.
    const stored = Buffer.from(guest.tokenHash, 'hex');
    const provided = Buffer.from(tokenHash, 'hex');
    if (
      stored.length !== provided.length ||
      !timingSafeEqual(stored, provided)
    ) {
      throw new UnauthorizedException('Unknown or expired guest token');
    }
    return guest;
  }

  async touch(guestId: string) {
    await this.prisma.guestPlayer.update({
      where: { id: guestId },
      data: { lastSeenAt: new Date() },
    });
  }

  async updateDisplayName(guestId: string, rawName: unknown) {
    const displayName = normalizeDisplayName(rawName, 'displayName');
    return this.prisma.guestPlayer.update({
      where: { id: guestId },
      data: { displayName },
    });
  }
}
