import { z } from 'zod';

// The CSP has no 'unsafe-eval'. Zod probes `new Function` when an object schema
// is BUILT, so client components must import this module BEFORE
// `@repo/contracts` (import order is evaluation order).
z.config({ jitless: true });
