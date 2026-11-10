import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InMemoryOrderRepository } from './data/order.repository';
import type { OrderRepository } from './data/order.repository';
import type { FulfillmentOrder } from './domain/order';
import type { PerformOrderActionDto } from './dto/perform-order-action.dto';
import {
  FulfillmentService,
  MAX_WORKFLOW_IDEMPOTENCY_ENTRIES,
} from './fulfillment.service';

describe('FulfillmentService', () => {
  let fulfillment: FulfillmentService;

  beforeEach(() => {
    fulfillment = new FulfillmentService(new InMemoryOrderRepository());
  });

  function perform(
    orderId: string,
    role: string | undefined,
    key: string | undefined,
    action: PerformOrderActionDto,
  ) {
    return fulfillment.performAction({
      orderId,
      role,
      idempotencyKey: key,
      action,
      requestId: 'request-0001',
    });
  }

  it('completes allocate, pick, pack, ship and return in order', () => {
    let order = perform(
      'FO-48291',
      'warehouse_manager',
      'workflow-allocate-01',
      {
        action: 'allocate',
        version: 1,
      },
    ).order;
    expect(order.status).toBe('allocated');

    order = perform('FO-48291', 'picker', 'workflow-pick-headphones', {
      action: 'pick',
      sku: 'AUR-220',
      quantity: 2,
      version: order.version,
    }).order;
    expect(order.status).toBe('picking');

    order = perform('FO-48291', 'picker', 'workflow-pick-cable-001', {
      action: 'pick',
      sku: 'CAB-118',
      quantity: 1,
      version: order.version,
    }).order;
    expect(order.status).toBe('picked');

    order = perform('FO-48291', 'packer', 'workflow-pack-order-01', {
      action: 'pack',
      version: order.version,
    }).order;
    expect(order.package?.id).toBe('PKG-48291-01');

    order = perform('FO-48291', 'packer', 'workflow-ship-order-01', {
      action: 'ship',
      version: order.version,
    }).order;
    expect(order.shipment?.trackingNumber).toContain('SIM-48291');

    order = perform('FO-48291', 'warehouse_manager', 'workflow-return-001', {
      action: 'return',
      reason: 'damaged',
      version: order.version,
    }).order;
    expect(order.status).toBe('returned');
    expect(order.returnInfo?.reason).toBe('damaged');
  });

  it('enforces role boundaries on workflow actions', () => {
    expect(() =>
      perform('FO-48291', 'picker', 'role-denied-0001', {
        action: 'allocate',
        version: 1,
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      perform('FO-48291', undefined, 'role-missing-001', {
        action: 'allocate',
        version: 1,
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      perform('FO-48291', 'administrator', 'unknown-profile-role-01', {
        action: 'allocate',
        version: 1,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects invalid transitions, unknown SKUs and over-picking', () => {
    expect(() =>
      perform('FO-48291', 'packer', 'pack-too-soon-001', {
        action: 'pack',
        version: 1,
      }),
    ).toThrow(ConflictException);

    expect(() =>
      perform('FO-48291', 'picker', 'pick-before-allocation-01', {
        action: 'pick',
        sku: 'AUR-220',
        quantity: 1,
        version: 1,
      }),
    ).toThrow(ConflictException);

    expect(() =>
      perform('FO-48277', 'picker', 'pick-unknown-sku-01', {
        action: 'pick',
        sku: 'NOT-IN-ORDER',
        quantity: 1,
        version: 1,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      perform('FO-48277', 'picker', 'pick-over-quantity-1', {
        action: 'pick',
        sku: 'LMP-406',
        quantity: 2,
        version: 1,
      }),
    ).toThrow(ConflictException);
  });

  it('rejects incomplete picks, missing keys, and invalid allocations', () => {
    const allocated = perform(
      'FO-48291',
      'warehouse_manager',
      'allocate-for-invalid-action-01',
      { action: 'allocate', version: 1 },
    ).order;

    expect(() =>
      perform('FO-48291', 'picker', 'pick-missing-fields-01', {
        action: 'pick',
        version: allocated.version,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      perform('FO-48291', 'warehouse_manager', undefined, {
        action: 'allocate',
        version: allocated.version,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      perform('FO-48291', 'warehouse_manager', 'short', {
        action: 'allocate',
        version: allocated.version,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      perform('FO-48291', 'warehouse_manager', 'allocate-twice-01', {
        action: 'allocate',
        version: allocated.version,
      }),
    ).toThrow(ConflictException);
  });

  it('rejects shipping and returns outside their allowed workflow states', () => {
    expect(() =>
      perform('FO-48291', 'packer', 'ship-before-pack-001', {
        action: 'ship',
        version: 1,
      }),
    ).toThrow(ConflictException);
    expect(() =>
      perform('FO-48291', 'warehouse_manager', 'return-before-ship-01', {
        action: 'return',
        reason: 'damaged',
        version: 1,
      }),
    ).toThrow(ConflictException);
  });

  it('requires a return reason after shipment', () => {
    let order = perform('FO-48291', 'warehouse_manager', 'reason-allocate-01', {
      action: 'allocate',
      version: 1,
    }).order;
    order = perform('FO-48291', 'picker', 'reason-pick-headphones-01', {
      action: 'pick',
      sku: 'AUR-220',
      quantity: 2,
      version: order.version,
    }).order;
    order = perform('FO-48291', 'picker', 'reason-pick-cable-0001', {
      action: 'pick',
      sku: 'CAB-118',
      quantity: 1,
      version: order.version,
    }).order;
    order = perform('FO-48291', 'packer', 'reason-pack-order-01', {
      action: 'pack',
      version: order.version,
    }).order;
    order = perform('FO-48291', 'packer', 'reason-ship-order-01', {
      action: 'ship',
      version: order.version,
    }).order;

    expect(() =>
      perform('FO-48291', 'warehouse_manager', 'return-missing-reason-01', {
        action: 'return',
        version: order.version,
      }),
    ).toThrow(BadRequestException);
  });

  it('returns the original result for an idempotent retry', () => {
    const action: PerformOrderActionDto = { action: 'allocate', version: 1 };
    const first = perform(
      'FO-48291',
      'warehouse_manager',
      'retry-allocation-01',
      action,
    );
    const replay = perform(
      'FO-48291',
      'warehouse_manager',
      'retry-allocation-01',
      action,
    );

    expect(first.order.version).toBe(2);
    expect(replay.replayed).toBe(true);
    expect(replay.order.version).toBe(2);
  });

  it('rejects a reused idempotency key and stale order versions', () => {
    const key = 'reuse-key-check-01';
    perform('FO-48291', 'warehouse_manager', key, {
      action: 'allocate',
      version: 1,
    });

    expect(() =>
      perform('FO-48291', 'warehouse_manager', key, {
        action: 'pack',
        version: 1,
      }),
    ).toThrow(ConflictException);

    expect(() =>
      perform('FO-48291', 'picker', 'stale-pick-version-1', {
        action: 'pick',
        sku: 'AUR-220',
        quantity: 1,
        version: 1,
      }),
    ).toThrow(ConflictException);
  });

  it('evicts the oldest idempotency result at the bounded storage limit', () => {
    const template = fulfillment.getOrder('FO-48291');
    const orders = new Map<string, FulfillmentOrder>();
    const repository: OrderRepository = {
      findAll: () => [],
      findById: (orderId) => {
        const order = orders.get(orderId);
        return order ? structuredClone(order) : undefined;
      },
      save: (order) => {
        const saved = structuredClone(order);
        orders.set(saved.id, saved);
        return structuredClone(saved);
      },
    };
    const service = new FulfillmentService(repository);
    const stdoutWrite = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      for (
        let index = 0;
        index <= MAX_WORKFLOW_IDEMPOTENCY_ENTRIES;
        index += 1
      ) {
        const orderId = `CAP-${String(index).padStart(5, '0')}`;
        orders.set(orderId, {
          ...structuredClone(template),
          id: orderId,
          orderNumber: orderId,
          status: 'accepted',
          version: 1,
        });
        service.performAction({
          orderId,
          role: 'warehouse_manager',
          idempotencyKey: `capacity-key-${String(index).padStart(5, '0')}`,
          action: { action: 'allocate', version: 1 },
          requestId: 'capacity-test-request',
        });
      }

      const newOrderId = `CAP-${String(MAX_WORKFLOW_IDEMPOTENCY_ENTRIES + 1).padStart(5, '0')}`;
      orders.set(newOrderId, {
        ...structuredClone(template),
        id: newOrderId,
        orderNumber: newOrderId,
        status: 'accepted',
        version: 1,
      });
      const newest = service.performAction({
        orderId: newOrderId,
        role: 'warehouse_manager',
        idempotencyKey: 'capacity-key-00000',
        action: { action: 'allocate', version: 1 },
        requestId: 'capacity-test-request',
      });
      expect(newest.order.status).toBe('allocated');
      expect(newest.replayed).toBe(false);
    } finally {
      stdoutWrite.mockRestore();
    }
  });

  it('filters orders and exposes summary and return records', () => {
    const allOrders = fulfillment.listOrders({});
    expect(allOrders.length).toBeGreaterThan(0);
    expect(fulfillment.listOrders({ status: 'all', limit: 50 })).toHaveLength(
      allOrders.length,
    );
    expect(
      fulfillment.listOrders({ status: 'returned', limit: 50 }),
    ).toHaveLength(1);
    expect(fulfillment.listOrders({ q: 'headphones', limit: 50 })).toHaveLength(
      1,
    );
    expect(fulfillment.listOrders({ q: 'no matching order' })).toHaveLength(0);
    expect(fulfillment.getSummary().openOrders).toBeGreaterThan(0);
    expect(fulfillment.getReturns()[0].orderNumber).toBe('FO-48186');
    expect(() => fulfillment.getOrder('FO-00000')).toThrow();
  });
});
