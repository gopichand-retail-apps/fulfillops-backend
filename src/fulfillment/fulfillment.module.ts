import { Module } from '@nestjs/common';
import { DemoAuthController } from '../auth/demo-auth.controller';
import { DemoSessionService } from '../auth/demo-session.service';
import { InMemoryOrderRepository } from './data/order.repository';
import { FulfillmentController } from './fulfillment.controller';
import { resolveWarehouseTimeZone } from './domain/warehouse-day';
import {
  FULFILLMENT_OPTIONS,
  FulfillmentService,
  ORDER_REPOSITORY,
} from './fulfillment.service';
import type { FulfillmentOptions } from './fulfillment.service';

@Module({
  controllers: [DemoAuthController, FulfillmentController],
  providers: [
    DemoSessionService,
    FulfillmentService,
    InMemoryOrderRepository,
    { provide: ORDER_REPOSITORY, useExisting: InMemoryOrderRepository },
    {
      provide: FULFILLMENT_OPTIONS,
      useFactory: (): FulfillmentOptions => ({
        timeZone: resolveWarehouseTimeZone(process.env.WAREHOUSE_TIME_ZONE),
      }),
    },
  ],
})
export class FulfillmentModule {}
