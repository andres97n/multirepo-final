import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiNoContentResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { LoginInput, MeResponse, RefreshInput, TokenPair } from '@repo/contracts/auth';
import type { Request } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/public.decorator';
import type { AuthUser, RequestMeta } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

class LoginDto extends createZodDto(LoginInput) {}
class RefreshDto extends createZodDto(RefreshInput) {}
class TokenPairDto extends createZodDto(TokenPair) {}
class MeDto extends createZodDto(MeResponse) {}

/** Client context kept on every new session (ip + user agent). */
function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * `POST /api/v1/auth/*` + `GET /api/v1/auth/me`.
 * Login and refresh are `@Public()` (they are how you earn a session); the
 * access JWT must be carried with every request. URI versioning and the
 * `/api` prefix come from `configure-app.ts`.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // The stricter named `login` throttler (from env) guards this route; the
  // default throttler is skipped so its general limit cannot mask it.
  @Public()
  @SkipThrottle({ default: true })
  @Post('login')
  @ZodResponse({ status: 200, description: 'Access + refresh tokens', type: TokenPairDto })
  login(@Body() body: LoginDto, @Req() req: Request): Promise<TokenPair> {
    return this.auth.login(body, requestMeta(req));
  }

  @Public()
  @Post('refresh')
  @ZodResponse({ status: 200, description: 'Rotated token pair', type: TokenPairDto })
  refresh(@Body() body: RefreshDto, @Req() req: Request): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken, requestMeta(req));
  }

  @HttpCode(204)
  @Post('logout')
  @ApiNoContentResponse({ description: 'Current session revoked' })
  async logout(@CurrentUser() user: AuthUser | undefined): Promise<void> {
    if (user === undefined) {
      throw new UnauthorizedException();
    }
    await this.auth.logout(user.sid);
  }

  @Get('me')
  @ZodResponse({ status: 200, description: 'The authenticated user', type: MeDto })
  me(@CurrentUser() user: AuthUser | undefined): Promise<MeResponse> {
    if (user === undefined) {
      throw new UnauthorizedException();
    }
    return this.auth.me(user.id);
  }
}
