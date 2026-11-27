import { InMemoryOrderRepository } from './data/order.repository';
import type { FulfillmentOrder, OrderStatus } from './domain/order';
import { FulfillmentService } from './fulfillment.service';

const NOW = Date.parse('2026-11-24T15:00:00.000Z');
const NEW_YORK = 'America/New_York';
const LOCAL_MIDNIGHT = Date.parse('2026-11-24T05:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type OrderFixture = {
  id: string;
  status: OrderStatus;
  packedAt: number | null;
  packageId?: string;
};

function makeOrder(fixture: OrderFixture): FulfillmentOrder {
  const { id, status, packedAt, packageId } = fixture;
  return {
    id,
    orderNumber: id,
    status,
    priority: 'standard',
    channel: 'direct',
    zone: 'A-01',
    promisedAt: new Date(NOW + 24 * HOUR).toISOString(),
    createdAt: new Date(NOW - 24 * HOUR).toISOString(),
    items: [
      {
        sku: 'SKU-1',
        name: 'Item',
        location: 'A-01-01',
        orderedQuantity: 1,
        pickedQuantity: status === 'accepted' ? 0 : 1,
      },
    ],
    allocation: null,
    package:
      packedAt === null
        ? null
        : {
            id: packageId ?? `PKG-${id}`,
            packedAt: new Date(packedAt).toISOString(),
          },
    shipment: null,
    returnInfo: null,
    events: [],
    version: 1,
  };
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => index);
}

function sixtyFiveOrdersAcrossLocalMidnight(): FulfillmentOrder[] {
  const packedTodayLocal = range(29).map((i) =>
    makeOrder({
      id: `FO-P${i}`,
      status: 'packed',
      packedAt: LOCAL_MIDNIGHT + i * MINUTE,
    }),
  );
  const returnedToday = makeOrder({
    id: 'FO-R0',
    status: 'returned',
    packedAt: LOCAL_MIDNIGHT + 30 * MINUTE,
  });
  const shippedLater = range(10).map((i) =>
    makeOrder({
      id: `FO-S${i}`,
      status: 'shipped',
      packedAt: LOCAL_MIDNIGHT + 7 * HOUR + i * MINUTE,
    }),
  );
  const packedYesterdayLocal = range(15).map((i) =>
    makeOrder({
      id: `FO-Y${i}`,
      status: 'packed',
      packedAt: LOCAL_MIDNIGHT - 1 - i * MINUTE,
    }),
  );
  const notPacked = range(10).map((i) =>
    makeOrder({ id: `FO-A${i}`, status: 'accepted', packedAt: null }),
  );
  return [
    ...packedTodayLocal,
    returnedToday,
    ...shippedLater,
    ...packedYesterdayLocal,
    ...notPacked,
  ];
}

function serviceFor(
  orders: FulfillmentOrder[],
  timeZone?: string,
): FulfillmentService {
  return new FulfillmentService(new InMemoryOrderRepository(orders), {
    ...(timeZone ? { timeZone } : {}),
    now: () => NOW,
  });
}

describe('FulfillmentService summary', () => {
  it('counts packages first packed today in the warehouse zone across all 65 orders', () => {
    const summary = serviceFor(
      sixtyFiveOrdersAcrossLocalMidnight(),
      NEW_YORK,
    ).getSummary();

    expect(summary.packedToday).toBe(40);
    expect(summary.openOrders).toBe(54);
    expect(summary.readyToPick).toBe(0);
  });

  it('uses UTC when no warehouse zone is configured', () => {
    const summary = serviceFor(
      sixtyFiveOrdersAcrossLocalMidnight(),
    ).getSummary();

    expect(summary.packedToday).toBe(55);
  });

  it('includes the first instant of the warehouse day and excludes the instant before', () => {
    const summary = serviceFor(
      [
        makeOrder({
          id: 'FO-B1',
          status: 'packed',
          packedAt: LOCAL_MIDNIGHT,
        }),
        makeOrder({
          id: 'FO-B2',
          status: 'packed',
          packedAt: LOCAL_MIDNIGHT - 1,
        }),
      ],
      NEW_YORK,
    ).getSummary();

    expect(summary.packedToday).toBe(1);
  });

  it('counts one package once even when two orders reference it', () => {
    const summary = serviceFor(
      [
        makeOrder({
          id: 'FO-D1',
          status: 'packed',
          packedAt: LOCAL_MIDNIGHT + HOUR,
          packageId: 'PKG-SHARED',
        }),
        makeOrder({
          id: 'FO-D2',
          status: 'shipped',
          packedAt: LOCAL_MIDNIGHT + HOUR,
          packageId: 'PKG-SHARED',
        }),
      ],
      NEW_YORK,
    ).getSummary();

    expect(summary.packedToday).toBe(1);
  });
});
