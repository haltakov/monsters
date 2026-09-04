import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AccountSession } from './auth.service';
import { getWebOrigins } from '../config/app-config';

export type AccountRequest = Request & { account?: AccountSession };

@Injectable()
export class AccountAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new UnauthorizedException('Sign in is required');
    // Cookie authentication needs a write-origin check in addition to CORS.
    // Browser form POSTs can reach controllers even when CORS denies the response.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (
        (origin !== undefined && !getWebOrigins().includes(origin)) ||
        (origin === undefined &&
          request.headers['sec-fetch-site'] === 'cross-site')
      ) {
        throw new ForbiddenException('Untrusted request origin');
      }
    }
    request.account = session;
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    if (request.account?.user.role !== 'admin') {
      throw new ForbiddenException('Administrator access is required');
    }
    return true;
  }
}
