import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { resolveRequestId } from '../../common/request-id';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
] as const;

export const redactConfig = {
  paths: [...REDACT_PATHS],
  censor: '[REDACTED]',
};

/**
 * Builds the pino-http options shared by the running app and the tests.
 * `stream` is only provided by tests that capture output to a destination;
 * the running app lets pino fall back to stdout (JSON) or pino-pretty (dev).
 */
export function buildPinoHttpOptions(config: AppConfig, stream?: DestinationStream): Options {
  const base: Options = {
    level: config.LOG_LEVEL,
    genReqId: (req: IncomingMessage) =>
      typeof req.id === 'string' && req.id.length > 0
        ? req.id
        : resolveRequestId(req.headers['x-request-id']),
    redact: redactConfig,
    serializers: {
      req: (req: IncomingMessage) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    customProps: (req: IncomingMessage) => ({ requestId: req.id }),
  };

  if (config.NODE_ENV === 'development') {
    return { ...base, transport: { target: 'pino-pretty', options: { singleLine: true } } };
  }
  if (stream) {
    return { ...base, stream };
  }
  return base;
}

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ pinoHttp: buildPinoHttpOptions(config) }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
