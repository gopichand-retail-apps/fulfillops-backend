import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  DemoRole,
  FulfillmentAction,
  FulfillmentOrder,
  OrderEvent,
  WorkflowResult,
  WorkflowSummary,
} from './domain/order';
import { DEMO_ROLES } from './domain/order';
import type { PerformOrderActionDto } from './dto/perform-order-action.dto';
import type { OrderRepository } from './data/order.repository';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
export const MAX_WORKFLOW_IDEMPOTENCY_ENTRIES = 1_000;
export type PerformOrderActionCommand = {
  orderId: string;
  role: string | undefined;
  idempotencyKey: string | undefined;
  action: PerformOrderActionDto;
  requestId: string;
};
const allowedRoles: Record<FulfillmentAction, readonly DemoRole[]> = {
  allocate: ['warehouse_manager'],
  pick: ['picker'],
  pack: ['packer'],
  ship: ['packer', 'warehouse_manager'],
  return: ['warehouse_manager'],
};

function isDemoRole(role: string | undefined): role is DemoRole {
  return DEMO_ROLES.some((demoRole) => demoRole === role);
}

@Injectable()
export class FulfillmentService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; result: WorkflowResult }
  >();

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}

  listOrders(query: ListOrdersQueryDto): FulfillmentOrder[] {
    return this.orders.findAll({
      status: query.status,
      query: query.q,
      limit: query.limit ?? 50,
    });
  }

  getOrder(orderId: string): FulfillmentOrder {
    const order = this.orders.findById(orderId);
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    return order;
  }

  getReturns(): FulfillmentOrder[] {
    return this.orders.findAll({ status: 'returned', limit: 50 });
  }

  getSummary(): WorkflowSummary {
    const allOrders = this.orders.findAll({ limit: 50 });
    const openOrders = allOrders.filter((order) =>
      ['accepted', 'allocated', 'picking', 'picked', 'packed'].includes(
        order.status,
      ),
    );
    const atRiskCutoff = Date.now() + 60 * 60_000;

    return {
      openOrders: openOrders.length,
      readyToPick: allOrders.filter(
        (order) => order.status === 'allocated' || order.status === 'picking',
      ).length,
      packedToday: allOrders.filter(
        (order) => order.status === 'packed' || order.status === 'shipped',
      ).length,
      slaAtRisk: openOrders.filter(
        (order) => Date.parse(order.promisedAt) <= atRiskCutoff,
      ).length,
    };
  }

  performAction(command: PerformOrderActionCommand): WorkflowResult {
    const {
      orderId,
      role: roleHeader,
      idempotencyKey,
      action,
      requestId,
    } = command;
    const role = this.requireRole(roleHeader);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint(orderId, role, action);
    const previous = this.idempotency.get(key);

    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Use a new idempotency key for a different action.',
        });
      }
      return { ...structuredClone(previous.result), replayed: true };
    }

    const order = this.getOrder(orderId);
    this.requireCurrentVersion(order, action.version);
    this.requireActionRole(action.action, role);
    this.logWorkflow(
      'fulfillops.workflow.started',
      requestId,
      action.action,
      order.status,
    );

    let message: string;
    try {
      message = this.applyAction(order, action);
    } catch (error) {
      this.logWorkflow(
        'fulfillops.workflow.failed',
        requestId,
        action.action,
        order.status,
      );
      throw error;
    }

    order.version += 1;
    order.events.unshift(this.createEvent(action.action, message, role));
    const savedOrder = this.orders.save(order);
    const result = { order: savedOrder, message, replayed: false };
    this.rememberAction(key, fingerprint, result);
    this.logWorkflow(
      'fulfillops.workflow.completed',
      requestId,
      action.action,
      savedOrder.status,
    );
    return result;
  }

  private requireRole(role: string | undefined): DemoRole {
    if (!isDemoRole(role)) {
      throw new UnauthorizedException({
        code: 'DEMO_ROLE_REQUIRED',
        message: 'Select a demo warehouse role to perform this action.',
      });
    }
    return role;
  }

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || !idempotencyKeyPattern.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
    return key;
  }

  private requireCurrentVersion(
    order: FulfillmentOrder,
    version: number,
  ): void {
    if (order.version !== version) {
      throw new ConflictException({
        code: 'STALE_ORDER',
        message: 'This order changed. Refresh it before trying again.',
      });
    }
  }

  private requireActionRole(action: FulfillmentAction, role: DemoRole): void {
    if (!allowedRoles[action].includes(role)) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message:
          'This action is not available for the selected warehouse role.',
      });
    }
  }

  private applyAction(
    order: FulfillmentOrder,
    action: PerformOrderActionDto,
  ): string {
    switch (action.action) {
      case 'allocate':
        return this.allocate(order);
      case 'pick':
        return this.pick(order, action);
      case 'pack':
        return this.pack(order);
      case 'ship':
        return this.ship(order);
      case 'return':
        return this.recordReturn(order, action);
    }
  }

  private allocate(order: FulfillmentOrder): string {
    if (order.status !== 'accepted')
      this.invalidTransition('Only accepted orders can be allocated.');
    order.status = 'allocated';
    order.allocation = {
      reference: `AL-${order.orderNumber.slice(-5)}`,
      allocatedAt: new Date().toISOString(),
    };
    return 'Inventory allocated to this order.';
  }

  private pick(order: FulfillmentOrder, action: PerformOrderActionDto): string {
    if (order.status !== 'allocated' && order.status !== 'picking') {
      this.invalidTransition('Allocate the order before picking.');
    }
    if (!action.sku || !action.quantity) {
      throw new BadRequestException({
        code: 'PICK_DETAILS_REQUIRED',
        message: 'Choose a SKU and quantity.',
      });
    }
    const item = order.items.find((candidate) => candidate.sku === action.sku);
    if (!item)
      throw new BadRequestException({
        code: 'SKU_NOT_IN_ORDER',
        message: 'SKU is not on this order.',
      });
    if (item.pickedQuantity + action.quantity > item.orderedQuantity) {
      this.invalidTransition(
        'Picked quantity cannot exceed the ordered quantity.',
      );
    }

    item.pickedQuantity += action.quantity;
    const allPicked = order.items.every(
      (candidate) => candidate.pickedQuantity === candidate.orderedQuantity,
    );
    order.status = allPicked ? 'picked' : 'picking';
    return `Picked ${action.quantity} unit${action.quantity === 1 ? '' : 's'} of ${item.name}.`;
  }

  private pack(order: FulfillmentOrder): string {
    if (order.status !== 'picked')
      this.invalidTransition('Complete every pick before packing.');
    order.status = 'packed';
    order.package = {
      id: `PKG-${order.orderNumber.slice(-5)}-01`,
      packedAt: new Date().toISOString(),
    };
    return 'Package sealed and ready for shipment.';
  }

  private ship(order: FulfillmentOrder): string {
    if (order.status !== 'packed')
      this.invalidTransition('Pack the order before shipping.');
    order.status = 'shipped';
    order.shipment = {
      carrier: 'ParcelPilot',
      trackingNumber: `SIM-${order.orderNumber.slice(-5)}-${order.version + 1}`,
      shippedAt: new Date().toISOString(),
    };
    return 'Simulated shipment created with ParcelPilot.';
  }

  private recordReturn(
    order: FulfillmentOrder,
    action: PerformOrderActionDto,
  ): string {
    if (order.status !== 'shipped')
      this.invalidTransition('Only shipped orders can be returned.');
    if (!action.reason) {
      throw new BadRequestException({
        code: 'RETURN_REASON_REQUIRED',
        message: 'Choose a return reason.',
      });
    }
    order.status = 'returned';
    order.returnInfo = {
      reason: action.reason,
      createdAt: new Date().toISOString(),
    };
    return `Return recorded: ${action.reason.replaceAll('_', ' ')}.`;
  }

  private invalidTransition(message: string): never {
    throw new ConflictException({ code: 'INVALID_TRANSITION', message });
  }

  private createEvent(
    action: FulfillmentAction,
    label: string,
    actorRole: DemoRole,
  ): OrderEvent {
    return {
      event: `fulfillment.${action}`,
      label,
      at: new Date().toISOString(),
      actorRole,
    };
  }

  private fingerprint(
    orderId: string,
    role: DemoRole,
    action: PerformOrderActionDto,
  ): string {
    return JSON.stringify({
      orderId,
      role,
      action: action.action,
      sku: action.sku,
      quantity: action.quantity,
      reason: action.reason,
      version: action.version,
    });
  }

  private rememberAction(
    key: string,
    fingerprint: string,
    result: WorkflowResult,
  ): void {
    if (this.idempotency.size >= MAX_WORKFLOW_IDEMPOTENCY_ENTRIES) {
      for (const oldestKey of this.idempotency.keys()) {
        this.idempotency.delete(oldestKey);
        break;
      }
    }
    this.idempotency.set(key, { fingerprint, result: structuredClone(result) });
  }

  private logWorkflow(
    eventName: string,
    requestId: string,
    action: FulfillmentAction,
    status: FulfillmentOrder['status'],
  ): void {
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: eventName.endsWith('.failed') ? 'WARN' : 'INFO',
        service: 'fulfillops-api',
        environment: process.env.NODE_ENV ?? 'development',
        eventName,
        requestId,
        outcome: eventName.endsWith('.failed') ? 'failure' : 'success',
        metadata: { action, orderStatus: status },
      })}\n`,
    );
  }
}
