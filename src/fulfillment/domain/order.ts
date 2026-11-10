export const ORDER_STATUSES = [
  'accepted',
  'allocated',
  'picking',
  'picked',
  'packed',
  'shipped',
  'returned',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENT_ACTIONS = [
  'allocate',
  'pick',
  'pack',
  'ship',
  'return',
] as const;

export type FulfillmentAction = (typeof FULFILLMENT_ACTIONS)[number];

export const DEMO_ROLES = ['picker', 'packer', 'warehouse_manager'] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export const RETURN_REASONS = [
  'damaged',
  'wrong_item',
  'customer_changed_mind',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export type OrderItem = {
  sku: string;
  name: string;
  location: string;
  orderedQuantity: number;
  pickedQuantity: number;
};

export type OrderEvent = {
  event: string;
  label: string;
  at: string;
  actorRole: DemoRole | 'system';
};

export type PackageInfo = {
  id: string;
  packedAt: string;
};

export type ShipmentInfo = {
  carrier: 'ParcelPilot';
  trackingNumber: string;
  shippedAt: string;
};

export type ReturnInfo = {
  reason: ReturnReason;
  createdAt: string;
};

export type FulfillmentOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  priority: 'expedite' | 'high' | 'standard';
  channel: 'direct' | 'marketplace' | 'store_transfer';
  zone: string;
  promisedAt: string;
  createdAt: string;
  items: OrderItem[];
  allocation: { reference: string; allocatedAt: string } | null;
  package: PackageInfo | null;
  shipment: ShipmentInfo | null;
  returnInfo: ReturnInfo | null;
  events: OrderEvent[];
  version: number;
};

export type WorkflowSummary = {
  openOrders: number;
  readyToPick: number;
  packedToday: number;
  slaAtRisk: number;
};

export type WorkflowResult = {
  order: FulfillmentOrder;
  message: string;
  replayed: boolean;
};
