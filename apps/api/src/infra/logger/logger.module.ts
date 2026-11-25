import { type BeforeApplicationShutdown, Global, Module } from '@nestjs/common';
import { Logger, LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { generateRequestId } from '../../common/request-id';
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
/** The guard-attached user the log serializer inspects. */
interface MaybeAuthedRequest extends IncomingMessage {
  user?: { id?: string };
}

export function buildPinoHttpOptions(config: AppConfig, stream?: DestinationStream): Options {
  const base: Options = {
    level: config.LOG_LEVEL,
    genReqId: (req: IncomingMessage) =>
      typeof req.id === 'string' && req.id.length > 0 ? req.id : generateRequestId(),
    redact: redactConfig,
    serializers: {
      // Path only: query strings may carry tokens.
      req: (req: IncomingMessage) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    // `userId` appears once a guard has authenticated the request (AC-M06.15);
    // anonymous requests carry no user field at all.
    customProps: (req: IncomingMessage) => {
      const userId = (req as MaybeAuthedRequest).user?.id;
      return userId === undefined ? { requestId: req.id } : { requestId: req.id, userId };
    },
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
export class LoggerModule implements BeforeApplicationShutdown {
  constructor(private readonly logger: Logger) {}

  /**
   * Runs after `onModuleDestroy` (DB connections already closed), before the HTTP server
   * stops. The only shutdown line: output from `onApplicationShutdown` is lost on exit.
   */
  beforeApplicationShutdown(signal?: string): void {
    this.logger.log(`shutting down (${signal ?? 'close'})`, 'Shutdown');
  }
}
