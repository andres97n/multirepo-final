import { z } from 'zod';
import { DEFAULT_MONGO_TIMEOUT_MS, MONGO_URI_PATTERN } from './mongo.constants';

export const mongoEnvFragment = z.object({
  // No default: `requiredInProduction` makes composeEnvSchema reject a missing
  // value in production; elsewhere the module falls back to DEFAULT_MONGO_URI.
  MONGO_URI: z.string().regex(MONGO_URI_PATTERN).optional().meta({ requiredInProduction: true }),
  MONGO_TIMEOUT_MS: z.coerce.number().int().min(100).default(DEFAULT_MONGO_TIMEOUT_MS),
});
