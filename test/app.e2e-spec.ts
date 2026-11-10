import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { apiCorsOptions } from './../src/common/api-cors.config';
import { ApiExceptionFilter } from './../src/common/api-exception.filter';
import { requestContextMiddleware } from './../src/common/request-context.middleware';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSummary(body: unknown): { openOrders: number; requestId: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new Error('Summary response does not match the API envelope.');
  }
  const openOrders = body.data.openOrders;
  const requestId = body.requestId;
  if (typeof openOrders !== 'number' || typeof requestId !== 'string') {
    throw new Error('Summary response fields have invalid types.');
  }
  return { openOrders, requestId };
}

function readErrorCode(body: unknown): string {
  if (!isRecord(body) || typeof body.code !== 'string') {
    throw new Error('Error response does not include a code.');
  }
  return body.code;
}

function readData(body: unknown): unknown {
  if (!isRecord(body) || !Object.hasOwn(body, 'data')) {
    throw new Error('Response does not include a data field.');
  }
  return body.data;
}

function readDataRecord(body: unknown): Record<string, unknown> {
  const data = readData(body);
  if (!isRecord(data)) throw new Error('Response data is not an object.');
  return data;
}

function readOrderList(body: unknown): Array<Record<string, unknown>> {
  const data = readData(body);
  if (!Array.isArray(data) || !data.every(isRecord)) {
    throw new Error('Response data is not an order list.');
  }
  return data;
}

function readStringProperty(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object response.');
  }
  const property: unknown = Reflect.get(value, key);
  if (typeof property !== 'string') {
    throw new Error(`Expected string response field: ${key}`);
  }
  return property;
}

@Controller('__test')
class ExceptionFilterTestController {
  @Get('internal-error')
  throwInternalError(): never {
    throw new Error('Private implementation detail');
  }

  @Get('string-error')
  throwStringError(): never {
    throw new BadRequestException('Malformed request.');
  }

  @Get('details-error')
  throwDetailsError(): never {
    throw new BadRequestException({
      code: 'FIELD_INVALID',
      message: 'One or more fields are invalid.',
      details: ['field-a', 42, 'field-b'],
    });
  }

  @Get('fallback-error')
  throwFallbackError(): never {
    throw new BadRequestException({ details: [] });
  }
}

describe('FulfillOps API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ExceptionFilterTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.enableCors(apiCorsOptions);
    app.use(requestContextMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  it('returns seeded metrics with a matching request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/summary')
      .expect(200);
    const summary = readSummary(response.body);

    expect(summary.openOrders).toBeGreaterThan(0);
    expect(summary.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns a correlated health status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(readDataRecord(response.body)).toEqual({ status: 'ok' });
    expect(readStringProperty(response.headers, 'x-request-id')).toBe(
      readStringProperty(response.body, 'requestId'),
    );
  });

  it('accepts a safe request ID and replaces an invalid one', async () => {
    const accepted = await request(app.getHttpServer())
      .get('/api/v1/summary')
      .set('x-request-id', 'request-id-0001')
      .expect(200);
    expect(accepted.headers['x-request-id']).toBe('request-id-0001');

    const rejected = await request(app.getHttpServer())
      .get('/api/v1/summary')
      .set('x-request-id', 'not a safe request id')
      .expect(200);
    expect(rejected.headers['x-request-id']).not.toBe('not a safe request id');

    const packageVersion = process.env.npm_package_version;
    try {
      delete process.env.npm_package_version;
      await request(app.getHttpServer()).get('/api/v1/summary').expect(200);
      process.env.npm_package_version = '0.1.0-test';
      await request(app.getHttpServer()).get('/api/v1/summary').expect(200);
    } finally {
      if (packageVersion === undefined) delete process.env.npm_package_version;
      else process.env.npm_package_version = packageVersion;
    }
  });

  it('returns a safe generic error and filters validation details', async () => {
    const internalError = await request(app.getHttpServer())
      .get('/api/v1/__test/internal-error')
      .expect(500);
    expect(readErrorCode(internalError.body)).toBe('INTERNAL_ERROR');
    const internalMessage = readStringProperty(internalError.body, 'message');
    expect(internalMessage).toBe('Internal server error');
    expect(internalMessage).not.toContain('Private implementation detail');

    const stringError = await request(app.getHttpServer())
      .get('/api/v1/__test/string-error')
      .expect(400);
    expect(readErrorCode(stringError.body)).toBe('REQUEST_ERROR');
    expect(readStringProperty(stringError.body, 'message')).toBe(
      'Malformed request.',
    );

    const detailsError = await request(app.getHttpServer())
      .get('/api/v1/__test/details-error')
      .expect(400);
    expect(detailsError.body).toMatchObject({
      code: 'FIELD_INVALID',
      message: 'One or more fields are invalid.',
      details: ['field-a', 'field-b'],
    });

    const fallbackError = await request(app.getHttpServer())
      .get('/api/v1/__test/fallback-error')
      .expect(400);
    expect(fallbackError.body).toMatchObject({
      code: 'REQUEST_ERROR',
      message: 'Request failed',
    });
  });

  it('serves bounded order, detail, and return reads', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/orders?status=accepted&q=headphones&limit=10')
      .expect(200);
    const orders = readOrderList(list.body);
    expect(orders.length).toBeGreaterThan(0);

    const orderId = orders[0]?.id;
    if (typeof orderId !== 'string')
      throw new Error('Expected seeded order ID.');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${encodeURIComponent(orderId)}`)
      .expect(200);
    expect(readDataRecord(detail.body).id).toBe(orderId);
    expect(
      readOrderList(
        (await request(app.getHttpServer()).get('/api/v1/returns').expect(200))
          .body,
      ).every((order) => order.status === 'returned'),
    ).toBe(true);

    const invalidLimit = await request(app.getHttpServer())
      .get('/api/v1/orders?limit=51')
      .expect(400);
    expect(readErrorCode(invalidLimit.body)).toBe('REQUEST_ERROR');
    const missingOrder = await request(app.getHttpServer())
      .get('/api/v1/orders/FO-00000')
      .expect(404);
    expect(readErrorCode(missingOrder.body)).toBe('ORDER_NOT_FOUND');
  });

  it('serves synthetic profiles without exposing role credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/profiles')
      .expect(200);

    expect(readData(response.body)).toEqual([
      { id: 'picker', role: 'picker' },
      { id: 'packer', role: 'packer' },
      { id: 'warehouse_manager', role: 'warehouse_manager' },
    ]);
  });

  it('issues a local session and rejects unknown profile IDs', async () => {
    const manager = request.agent(app.getHttpServer());
    const issued = await manager
      .post('/api/v1/auth/session')
      .send({ profileId: 'warehouse_manager' })
      .expect(201);
    expect(readDataRecord(issued.body).profile).toEqual({
      id: 'warehouse_manager',
      role: 'warehouse_manager',
    });
    expect(issued.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(issued.headers['set-cookie'][0]).toContain('SameSite=Lax');

    await request(app.getHttpServer())
      .post('/api/v1/auth/session')
      .send({ profileId: 'administrator' })
      .expect(400);
  });

  it('revokes the active session during logout', async () => {
    const picker = request.agent(app.getHttpServer());
    await picker
      .post('/api/v1/auth/session')
      .send({ profileId: 'picker' })
      .expect(201);
    await picker.post('/api/v1/auth/logout').expect(201);

    await picker
      .post('/api/v1/orders/FO-48291/actions')
      .set('idempotency-key', 'after-logout-action-01')
      .send({ action: 'pick', sku: 'AUR-220', quantity: 1, version: 1 })
      .expect(401);
  });

  it('revokes a synthetic session on logout', async () => {
    const picker = request.agent(app.getHttpServer());
    await picker
      .post('/api/v1/auth/session')
      .send({ profileId: 'picker' })
      .expect(201);
    await picker.post('/api/v1/auth/logout').expect(201);

    await picker
      .post('/api/v1/orders/FO-48291/actions')
      .set('idempotency-key', 'after-logout-action-01')
      .send({ action: 'pick', sku: 'AUR-220', quantity: 1, version: 1 })
      .expect(401);
  });

  it('does not trust a client-supplied role without a server session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders/FO-48291/actions')
      .set('x-demo-role', 'warehouse_manager')
      .set('idempotency-key', 'client-role-header-001')
      .send({ action: 'allocate', version: 1 })
      .expect(401);
  });

  it('authorizes workflow actions from the server session profile', async () => {
    const picker = request.agent(app.getHttpServer());
    await picker
      .post('/api/v1/auth/session')
      .send({ profileId: 'picker' })
      .expect(201);
    const denied = await picker
      .post('/api/v1/orders/FO-48291/actions')
      .set('idempotency-key', 'picker-cannot-allocate-01')
      .send({ action: 'allocate', version: 1 })
      .expect(403);
    expect(readErrorCode(denied.body)).toBe('ROLE_NOT_ALLOWED');

    const manager = request.agent(app.getHttpServer());
    await manager
      .post('/api/v1/auth/session')
      .send({ profileId: 'warehouse_manager' })
      .expect(201);
    await manager
      .post('/api/v1/orders/FO-48291/actions')
      .set('idempotency-key', 'manager-allocates-order-01')
      .send({ action: 'allocate', version: 1 })
      .expect(201);
  });

  it('allows the frontend origin and credentialed action headers during preflight', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/orders/FO-48291/actions')
      .set('Origin', 'http://127.0.0.1:5201')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type,idempotency-key,x-request-id',
      )
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5201',
    );
    expect(response.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows the isolated Playwright frontend origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/summary')
      .set('Origin', 'http://127.0.0.1:5203')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5203',
    );
  });

  it('does not grant CORS access to other portfolio apps', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/summary')
      .set('Origin', 'http://127.0.0.1:5401')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects packing before picking is complete', async () => {
    const packer = request.agent(app.getHttpServer());
    await packer
      .post('/api/v1/auth/session')
      .send({ profileId: 'packer' })
      .expect(201);

    await packer
      .post('/api/v1/orders/FO-48291/actions')
      .set('idempotency-key', 'e2e-pack-before-pick')
      .send({ action: 'pack', version: 1 })
      .expect(409)
      .expect(({ body }) => {
        expect(readErrorCode(body)).toBe('INVALID_TRANSITION');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
