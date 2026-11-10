import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };
type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDetails(body: ErrorRecord | undefined): string[] | undefined {
  const rawDetails = body?.details ?? body?.message;
  if (!Array.isArray(rawDetails)) return undefined;
  return rawDetails.filter(
    (item: unknown): item is string => typeof item === 'string',
  );
}

function getPublicMessage(
  status: number,
  body: ErrorRecord | undefined,
  details: string[] | undefined,
): string {
  if (status >= 500) return 'Internal server error';
  if (typeof body?.message === 'string') return body.message;
  return details?.join('; ') || 'Request failed';
}

function getPublicCode(status: number, body: ErrorRecord | undefined): string {
  if (typeof body?.code === 'string') return body.code;
  return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = isRecord(rawBody) ? rawBody : undefined;
    const requestId = request.requestId ?? 'unavailable';
    const details = getDetails(body);
    const message = getPublicMessage(status, body, details);
    const code = getPublicCode(status, body);
    response.status(status).json({
      code,
      message,
      requestId,
      ...(details && details.length > 0 ? { details } : {}),
    });
  }
}
