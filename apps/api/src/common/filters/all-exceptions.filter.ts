import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ErrorCodes, type ErrorCode } from '@repo/contracts';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { DbError, mapDbError } from '../../infra/database/core';
import { getRequestId } from '../request-context';
import { generateRequestId } from '../request-id';

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodes.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCodes.SERVICE_UNAVAILABLE,
};

export function httpStatusToErrorCode(status: number): ErrorCode {
  return STATUS_TO_CODE[status] ?? ErrorCodes.INTERNAL;
}

export function zodIssuesToDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function toZodError(exception: unknown): ZodError | undefined {
  if (exception instanceof ZodError) {
    return exception;
  }
  if (exception instanceof ZodValidationException) {
    const inner = exception.getZodError();
    return inner instanceof ZodError ? inner : undefined;
  }
  return undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(Logger) private readonly logger: Pick<Logger, 'error'>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    // The request-id middleware is the single source (`req.id`); the ALS value is a fallback.
    const requestId =
      typeof request.id === 'string' && request.id.length > 0
        ? request.id
        : (getRequestId() ?? generateRequestId());

    let status: number;
    let code: ErrorCode;
    let message: string;
    let details: unknown;

    const zodError = toZodError(exception);
    if (zodError) {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCodes.VALIDATION_FAILED;
      message = 'Validation failed';
      details = zodIssuesToDetails(zodError);
    } else if (exception instanceof DbError) {
      const mapped = mapDbError(exception);
      status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      code = mapped?.code ?? ErrorCodes.INTERNAL;
      const isServerError = status >= 500;
      message =
        isServerError && this.config.NODE_ENV === 'production'
          ? 'Internal server error'
          : (mapped?.message ?? exception.message);
      if (mapped?.details !== undefined) {
        details = mapped.details;
      }
      if (isServerError) {
        this.logger.error({ err: exception, requestId }, 'DbError 5xx');
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = httpStatusToErrorCode(status);
      const isServerError = status >= 500;
      message =
        isServerError && this.config.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message;
      if (isServerError) {
        this.logger.error({ err: exception, requestId }, 'HttpException 5xx');
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCodes.INTERNAL;
      message =
        this.config.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({ err: error, requestId }, 'Unhandled exception');
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        requestId,
      },
    });
  }
}
