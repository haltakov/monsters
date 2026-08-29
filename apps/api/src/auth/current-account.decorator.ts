import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AccountRequest } from './account-auth.guard';

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AccountRequest>().account!,
);
