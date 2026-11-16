import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { getRequestId } from '../request-context';
import { requestIdMiddleware } from './request-id.middleware';

const UUID_V4 = '123e4567-e89b-12d3-a456-426614174000';

function run(incoming?: unknown): {
  req: Request & { id?: string };
  header: string | undefined;
  nextCalls: number;
  idInsideContext: string | undefined;
} {
  const req = { headers: incoming === undefined ? {} : { 'x-request-id': incoming } } as Request & {
    id?: string;
  };
  let header: string | undefined;
  let nextCalls = 0;
  let idInsideContext: string | undefined;

  const res = {
    setHeader: (name: string, value: string) => {
      if (name === 'x-request-id') {
        header = value;
      }
      return res;
    },
  } as Response;

  const next = (() => {
    nextCalls += 1;
    idInsideContext = getRequestId();
  }) as NextFunction;

  requestIdMiddleware(req, res, next);
  return { req, header, nextCalls, idInsideContext };
}

describe('requestIdMiddleware', () => {
  it('echoes a valid x-request-id and sets req.id + response header', () => {
    const { req, header, nextCalls } = run(UUID_V4);
    expect(req.id).toBe(UUID_V4);
    expect(header).toBe(UUID_V4);
    expect(nextCalls).toBe(1);
  });

  it('replaces an invalid x-request-id with a fresh valid id', () => {
    const { req, header } = run('<script>');
    expect(req.id).toBeTruthy();
    expect(req.id).not.toBe('<script>');
    expect(header).toBe(req.id);
  });

  it('generates an id when no x-request-id is present', () => {
    const { req, header } = run();
    expect(req.id).toBeTruthy();
    expect(header).toBe(req.id);
  });

  it('binds the id to the request context', () => {
    const { idInsideContext } = run(UUID_V4);
    expect(idInsideContext).toBe(UUID_V4);
  });
});
