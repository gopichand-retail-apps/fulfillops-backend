import { IsIn } from 'class-validator';
import { DEMO_ROLES } from '../../fulfillment/domain/order';
import type { DemoRole } from '../../fulfillment/domain/order';

export class CreateDemoSessionDto {
  @IsIn(DEMO_ROLES)
  profileId!: DemoRole;
}
