import { randomUUID } from 'node:crypto';
import { APP_VERSION } from '../app-version';
import type { NextFunction, Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

const requestIdPattern = /^[A-Za-z0-9._-]{8,64}$/;

export function requestContextMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const suppliedId = request.header('x-request-id');
  const requestId =
    suppliedId && requestIdPattern.test(suppliedId) ? suppliedId : randomUUID();
  const startedAt = Date.now();

  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  response.on('finish', () => {
    const status = response.statusCode;
    const routeTemplate = request.path.replace(/\/FO-[A-Z0-9-]+/g, '/:id');
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    const eventName =
      status >= 400 ? 'api.request.failed' : 'api.request.completed';

    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: 'fulfillops-api',
        environment: process.env.NODE_ENV ?? 'development',
        version: APP_VERSION,
        eventName,
        requestId,
        routeTemplate,
        httpMethod: request.method,
        httpStatus: status,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: status >= 400 ? 'failure' : 'success',
        ...(status >= 400 ? { errorCode: 'HTTP_ERROR' } : {}),
      })}\n`,
    );
  });

  next();
}
