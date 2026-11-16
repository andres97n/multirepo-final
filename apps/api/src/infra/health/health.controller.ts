import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Health } from '@repo/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

class HealthDto extends createZodDto(Health) {}

// Liveness probes (orchestrators, Docker HEALTHCHECK) must never be rate limited.
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get('live')
  @ZodResponse({ status: 200, description: 'Liveness check', type: HealthDto })
  live(): Health {
    return { status: 'ok', checks: {} };
  }
}
