import { Health } from '@repo/contracts';

import { apiGet } from '../../../lib/api-client.server';
import { resolveRequestId } from '../../../lib/request-id';

export const dynamic = 'force-dynamic';

/** Deep checks get a shorter timeout than regular API calls. */
const DEEP_CHECK_TIMEOUT_MS = 2000;

/**
 * GET /api/health — web liveness (200 `Health`).
 * GET /api/health?deep=1 — also probes the API readiness endpoint; returns 503
 * with `status: 'down'` when the API is unreachable or not ok (AC-M08.2).
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const deep = new URL(request.url).searchParams.get('deep') === '1';

  const checks: Health['checks'] = { web: { status: 'ok' } };
  let status: Health['status'] = 'ok';
  let httpStatus = 200;

  if (deep) {
    try {
      const api = await apiGet('/api/v1/health/ready', Health, {
        requestId,
        timeoutMs: DEEP_CHECK_TIMEOUT_MS,
        cache: 'no-store',
        acceptErrorBody: true,
      });
      checks.api = { status: api.status };
      if (api.status !== 'ok') {
        status = 'down';
        httpStatus = 503;
      }
    } catch {
      checks.api = { status: 'down', message: 'API unreachable' };
      status = 'down';
      httpStatus = 503;
    }
  }

  return Response.json(
    { status, checks },
    { status: httpStatus, headers: { 'x-request-id': requestId } },
  );
}
