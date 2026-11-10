import type { FulfillmentOrder, OrderStatus } from '../domain/order';

export type OrderSearch = {
  status?: string;
  query?: string;
  limit: number;
};

export interface OrderRepository {
  findAll(search: OrderSearch): FulfillmentOrder[];
  findById(orderId: string): FulfillmentOrder | undefined;
  save(order: FulfillmentOrder): FulfillmentOrder;
}

function dateOffset(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function createEvents(status: OrderStatus): FulfillmentOrder['events'] {
  const labels: Record<OrderStatus, string> = {
    accepted: 'Order accepted',
    allocated: 'Inventory allocated',
    picking: 'Picking started',
    picked: 'Pick complete',
    packed: 'Package sealed',
    shipped: 'Shipment simulated',
    returned: 'Return recorded',
  };
  const progression: OrderStatus[] = [
    'accepted',
    'allocated',
    'picking',
    'picked',
    'packed',
    'shipped',
    'returned',
  ];
  const endIndex = progression.indexOf(status);

  return progression.slice(0, endIndex + 1).map((event, index) => ({
    event: `fulfillment.${event}`,
    label: labels[event],
    at: dateOffset(-55 + index * 8),
    actorRole: index === 0 ? 'system' : 'warehouse_manager',
  }));
}

type SeedOrderInput = {
  orderNumber: string;
  status: OrderStatus;
  priority: FulfillmentOrder['priority'];
  promisedInMinutes: number;
  items: FulfillmentOrder['items'];
  zone: string;
  channel?: FulfillmentOrder['channel'];
};

function createSeedOrder(input: SeedOrderInput): FulfillmentOrder {
  const {
    orderNumber,
    status,
    priority,
    promisedInMinutes,
    items,
    zone,
    channel = 'direct',
  } = input;
  const stageIndex = [
    'accepted',
    'allocated',
    'picking',
    'picked',
    'packed',
    'shipped',
    'returned',
  ].indexOf(status);
  const hasAllocation = stageIndex >= 1;
  const hasPackage = stageIndex >= 4;
  const hasShipment = stageIndex >= 5;
  const isReturned = status === 'returned';
  const reference = `AL-${orderNumber.slice(-5)}`;

  return {
    id: orderNumber,
    orderNumber,
    status,
    priority,
    channel,
    zone,
    promisedAt: dateOffset(promisedInMinutes),
    createdAt: dateOffset(-55),
    items,
    allocation: hasAllocation
      ? { reference, allocatedAt: dateOffset(-38) }
      : null,
    package: hasPackage
      ? { id: `PKG-${orderNumber.slice(-5)}-01`, packedAt: dateOffset(-12) }
      : null,
    shipment: hasShipment
      ? {
          carrier: 'ParcelPilot',
          trackingNumber: `SIM-${orderNumber.slice(-5)}-01`,
          shippedAt: dateOffset(-5),
        }
      : null,
    returnInfo: isReturned
      ? { reason: 'wrong_item', createdAt: dateOffset(-2) }
      : null,
    events: createEvents(status),
    version: 1,
  };
}

function seedOrders(): FulfillmentOrder[] {
  return [
    createSeedOrder({
      orderNumber: 'FO-48291',
      status: 'accepted',
      priority: 'expedite',
      promisedInMinutes: 28,
      items: [
        {
          sku: 'AUR-220',
          name: 'Studio headphones',
          location: 'A-03-14',
          orderedQuantity: 2,
          pickedQuantity: 0,
        },
        {
          sku: 'CAB-118',
          name: 'Braided USB-C cable',
          location: 'A-03-18',
          orderedQuantity: 1,
          pickedQuantity: 0,
        },
      ],
      zone: 'A-03',
    }),
    createSeedOrder({
      orderNumber: 'FO-48277',
      status: 'allocated',
      priority: 'high',
      promisedInMinutes: 76,
      items: [
        {
          sku: 'LMP-406',
          name: 'Task lamp, graphite',
          location: 'C-11-02',
          orderedQuantity: 1,
          pickedQuantity: 0,
        },
        {
          sku: 'ORG-044',
          name: 'Desk organizer',
          location: 'C-11-08',
          orderedQuantity: 2,
          pickedQuantity: 0,
        },
      ],
      zone: 'C-11',
      channel: 'marketplace',
    }),
    createSeedOrder({
      orderNumber: 'FO-48262',
      status: 'picking',
      priority: 'expedite',
      promisedInMinutes: 14,
      items: [
        {
          sku: 'MUG-008',
          name: 'Thermal travel mug',
          location: 'B-05-07',
          orderedQuantity: 2,
          pickedQuantity: 1,
        },
        {
          sku: 'BOT-214',
          name: 'Insulated bottle',
          location: 'B-05-10',
          orderedQuantity: 1,
          pickedQuantity: 0,
        },
      ],
      zone: 'B-05',
    }),
    createSeedOrder({
      orderNumber: 'FO-48249',
      status: 'picked',
      priority: 'standard',
      promisedInMinutes: 124,
      items: [
        {
          sku: 'PLN-031',
          name: 'Weekly planner',
          location: 'D-02-04',
          orderedQuantity: 1,
          pickedQuantity: 1,
        },
        {
          sku: 'PEN-672',
          name: 'Fountain pen set',
          location: 'D-02-09',
          orderedQuantity: 1,
          pickedQuantity: 1,
        },
      ],
      zone: 'D-02',
    }),
    createSeedOrder({
      orderNumber: 'FO-48214',
      status: 'packed',
      priority: 'high',
      promisedInMinutes: 52,
      items: [
        {
          sku: 'BLN-511',
          name: 'Wool blend throw',
          location: 'E-08-03',
          orderedQuantity: 1,
          pickedQuantity: 1,
        },
      ],
      zone: 'E-08',
      channel: 'marketplace',
    }),
    createSeedOrder({
      orderNumber: 'FO-48198',
      status: 'shipped',
      priority: 'standard',
      promisedInMinutes: -22,
      items: [
        {
          sku: 'TRV-090',
          name: 'Carry-on packing cubes',
          location: 'F-01-05',
          orderedQuantity: 1,
          pickedQuantity: 1,
        },
      ],
      zone: 'F-01',
    }),
    createSeedOrder({
      orderNumber: 'FO-48186',
      status: 'returned',
      priority: 'standard',
      promisedInMinutes: -88,
      items: [
        {
          sku: 'ORG-044',
          name: 'Desk organizer',
          location: 'C-11-08',
          orderedQuantity: 1,
          pickedQuantity: 1,
        },
      ],
      zone: 'C-11',
      channel: 'store_transfer',
    }),
    createSeedOrder({
      orderNumber: 'FO-48175',
      status: 'accepted',
      priority: 'high',
      promisedInMinutes: 168,
      items: [
        {
          sku: 'KET-301',
          name: 'Electric kettle, matte',
          location: 'G-04-12',
          orderedQuantity: 1,
          pickedQuantity: 0,
        },
      ],
      zone: 'G-04',
    }),
  ];
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map(
    seedOrders().map((order) => [order.id, order]),
  );

  findAll(search: OrderSearch): FulfillmentOrder[] {
    const normalizedQuery = search.query?.trim().toLowerCase();
    return [...this.orders.values()]
      .filter(
        (order) =>
          !search.status ||
          search.status === 'all' ||
          order.status === search.status,
      )
      .filter((order) => {
        if (!normalizedQuery) return true;
        const searchable = [
          order.orderNumber,
          order.channel,
          order.zone,
          ...order.items.flatMap((item) => [item.sku, item.name]),
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((left, right) => left.promisedAt.localeCompare(right.promisedAt))
      .slice(0, search.limit)
      .map((order) => structuredClone(order));
  }

  findById(orderId: string): FulfillmentOrder | undefined {
    const order = this.orders.get(orderId);
    return order ? structuredClone(order) : undefined;
  }

  save(order: FulfillmentOrder): FulfillmentOrder {
    const savedOrder = structuredClone(order);
    this.orders.set(order.id, savedOrder);
    return structuredClone(savedOrder);
  }
}
