import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function runNode(
  script: string,
  env: Record<string, string>,
): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code, stderr });
    });
  });
}

describe('boot failure (AC-M03.8)', () => {
  it('exits non-zero and names CORS_ORIGIN when CORS_ORIGIN=* in production', async () => {
    const mainJs = path.join(process.cwd(), 'dist', 'main.js');
    expect(existsSync(mainJs), `missing ${mainJs}; run "pnpm --filter api build" first`).toBe(true);

    const { exitCode, stderr } = await runNode(mainJs, {
      NODE_ENV: 'production',
      CORS_ORIGIN: '*',
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('CORS_ORIGIN');
  }, 30000);
});
