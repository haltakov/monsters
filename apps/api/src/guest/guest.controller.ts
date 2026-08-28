import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentGuest } from './current-guest.decorator';
import { GuestAuthGuard } from './guest-auth.guard';
import { GuestService, type GuestRecord } from './guest.service';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { getGuestBootstrapLimit } from '../config/app-config';

@Controller('guest')
export class GuestController {
  constructor(private readonly guests: GuestService) {}

  /** Issues a brand-new anonymous identity. The raw token is shown once. */
  @Post('bootstrap')
  @HttpCode(201)
  @Throttle({ default: { limit: getGuestBootstrapLimit(), ttl: 60_000 } })
  async bootstrap() {
    const { token, guest } = await this.guests.bootstrap();
    return { token, guest: this.guests.toProfile(guest) };
  }

  @Get('me')
  @UseGuards(GuestAuthGuard)
  async me(@CurrentGuest() guest: GuestRecord) {
    await this.guests.touch(guest.id);
    return { guest: this.guests.toProfile(guest) };
  }

  @Patch('me')
  @UseGuards(GuestAuthGuard)
  async update(
    @CurrentGuest() guest: GuestRecord,
    @Body() body: UpdateGuestDto,
  ) {
    const updated = await this.guests.updateDisplayName(
      guest.id,
      body.displayName,
    );
    return { guest: this.guests.toProfile(updated) };
  }
}
