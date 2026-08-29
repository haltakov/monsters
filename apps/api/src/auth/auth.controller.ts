import { Controller, Get } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('account')
export class AuthConfigurationController {
  constructor(private readonly auth: AuthService) {}

  @Get('auth-configuration')
  configuration() {
    return this.auth.configuration;
  }
}
