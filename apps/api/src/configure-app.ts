import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { APP_CONFIG, type AppConfig } from './config/app-config';

/**
 * Applies every piece of runtime wiring shared by `main.ts` and the e2e tests
 * so that both exercise identical configuration.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get<AppConfig>(APP_CONFIG);

  // Express "trust proxy" hop count from env (0 = disabled).
  app.set('trust proxy', config.TRUST_PROXY);

  // Request id must be assigned before routing so 404s also carry it.
  app.use(requestIdMiddleware);

  // Security headers (CSP disabled: this is a JSON API, not an HTML app).
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS allowlist from env. No credentials (tokens go in the Authorization header).
  app.enableCors({ origin: config.CORS_ORIGIN, credentials: false });

  // Compression is intentionally not enabled; see apps/api/AGENTS.md.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  if (config.NODE_ENV !== 'production' || config.API_DOCS_ENABLED) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ax-orchester API')
      .setDescription(
        'Validated config, contract-based validation, uniform errors, request ids, safe logging, security.',
      )
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document), {
      useGlobalPrefix: true,
    });
  }

  return app;
}
