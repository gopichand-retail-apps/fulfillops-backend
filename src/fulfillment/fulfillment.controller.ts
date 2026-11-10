import {
  Controller,
  Body,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { DemoSessionService } from '../auth/demo-session.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { PerformOrderActionDto } from './dto/perform-order-action.dto';
import { FulfillmentService } from './fulfillment.service';

type RequestWithId = {
  requestId: string;
  headers: { cookie?: string };
};

@Controller()
export class FulfillmentController {
  constructor(
    private readonly fulfillment: FulfillmentService,
    private readonly sessions: DemoSessionService,
  ) {}

  @Get('summary')
  getSummary(@Req() request: RequestWithId) {
    return this.success(request, this.fulfillment.getSummary());
  }

  @Get('orders')
  getOrders(@Req() request: RequestWithId, @Query() query: ListOrdersQueryDto) {
    return this.success(request, this.fulfillment.listOrders(query));
  }

  @Get('orders/:id')
  getOrder(@Req() request: RequestWithId, @Param('id') orderId: string) {
    return this.success(request, this.fulfillment.getOrder(orderId));
  }

  @Get('returns')
  getReturns(@Req() request: RequestWithId) {
    return this.success(request, this.fulfillment.getReturns());
  }

  @Post('orders/:id/actions')
  performAction(
    @Req() request: RequestWithId,
    @Param('id') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() action: PerformOrderActionDto,
  ) {
    const role = this.sessions.roleForSession(request.headers.cookie);
    const result = this.fulfillment.performAction({
      orderId,
      role,
      idempotencyKey,
      action,
      requestId: request.requestId,
    });
    return this.success(request, result);
  }

  private success<T>(request: RequestWithId, data: T) {
    return { data, requestId: request.requestId };
  }
}
