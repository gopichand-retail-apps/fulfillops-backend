import { Module } from '@nestjs/common';
import { DemoAuthController } from '../auth/demo-auth.controller';
import { DemoSessionService } from '../auth/demo-session.service';
import { InMemoryOrderRepository } from './data/order.repository';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService, ORDER_REPOSITORY } from './fulfillment.service';

@Module({
  controllers: [DemoAuthController, FulfillmentController],
  providers: [
    DemoSessionService,
    FulfillmentService,
    InMemoryOrderRepository,
    { provide: ORDER_REPOSITORY, useExisting: InMemoryOrderRepository },
  ],
})
export class FulfillmentModule {}
