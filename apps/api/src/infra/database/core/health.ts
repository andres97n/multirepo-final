export interface DatabaseHealthResult {
  status: 'ok' | 'down';
  message?: string;
}

/** Readiness port implemented by every database adapter. */
export interface DatabaseHealth {
  check(): Promise<DatabaseHealthResult>;
}
