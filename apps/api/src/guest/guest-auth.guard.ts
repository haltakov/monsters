import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestService } from './guest.service';
import { AuthService, type AccountSession } from '../auth/auth.service';

export type AuthenticatedRequest = Request & {
  guest?: { id: string; displayName: string };
  account?: AccountSession;
};

export function readBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(
    private readonly guests: GuestService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('A guest bearer token is required');
    }
    request.guest = await this.guests.authenticate(token);
    const account = await this.auth.getSession(request.headers);
    if (account) request.account = account;
    return true;
  }
}
