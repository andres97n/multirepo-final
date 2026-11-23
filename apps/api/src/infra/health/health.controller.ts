import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Health } from '@repo/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/public.decorator';
import { DATABASE_HEALTH, type DatabaseHealth } from '../database/core';

class HealthDto extends createZodDto(Health) {}

// Liveness/readiness probes (orchestrators, Docker HEALTHCHECK) are never rate limited.
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(@Optional() @Inject(DATABASE_HEALTH) private readonly database?: DatabaseHealth) {}

  @Get('live')
  @ZodResponse({ status: 200, description: 'Liveness check', type: HealthDto })
  live(): Health {
    return { status: 'ok', checks: {} };
  }

  @Get('ready')
  @ZodResponse({ status: 200, description: 'Readiness check', type: HealthDto })
  @ApiResponse({ status: 503, description: 'Readiness check failed', type: HealthDto })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Health> {
    const checks: Health['checks'] = {};
    let status: 'ok' | 'down' = 'ok';
    if (this.database) {
      const result = await this.database.check();
      checks.database = result;
      if (result.status !== 'ok') {
        status = 'down';
        res.status(503);
      }
    }
    return { status, checks };
  }
}
