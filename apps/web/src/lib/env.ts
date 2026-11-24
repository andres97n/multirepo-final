import 'server-only';

import { parseEnv, type WebEnv } from './env.schema';

/**
 * Parsed once at module load. Importing this module from a client component is
 * a build error because of `server-only` (AC-M08.7).
 */
export const env: WebEnv = parseEnv(process.env);

export { parseEnv } from './env.schema';
export type { WebEnv } from './env.schema';
