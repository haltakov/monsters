import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AccountSession } from './auth.service';

export type AccountRequest = Request & { account?: AccountSession };

@Injectable()
export class AccountAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new UnauthorizedException('Sign in is required');
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
