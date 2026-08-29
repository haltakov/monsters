import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AccountAuthGuard } from '../auth/account-auth.guard';
import { CurrentAccount } from '../auth/current-account.decorator';
import type { AccountSession } from '../auth/auth.service';
import { CurrentGuest } from '../guest/current-guest.decorator';
import { GuestAuthGuard } from '../guest/guest-auth.guard';
import type { GuestRecord } from '../guest/guest.service';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(GuestAuthGuard, AccountAuthGuard)
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  @Post('claim')
  @HttpCode(200)
  claim(
    @CurrentGuest() guest: GuestRecord,
    @CurrentAccount() account: AccountSession,
  ) {
    return this.accounts.claimGuest(guest.id, account.user.id);
  }

  @Post('release')
  @HttpCode(200)
  release(
    @CurrentGuest() guest: GuestRecord,
    @CurrentAccount() account: AccountSession,
  ) {
    return this.accounts.releaseGuest(guest.id, account.user.id);
  }
}
