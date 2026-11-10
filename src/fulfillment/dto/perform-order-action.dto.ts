import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { ReturnReason } from '../domain/order';
import { FULFILLMENT_ACTIONS, RETURN_REASONS } from '../domain/order';

export class PerformOrderActionDto {
  @IsIn(FULFILLMENT_ACTIONS)
  action!: (typeof FULFILLMENT_ACTIONS)[number];

  @ValidateIf((action: PerformOrderActionDto) => action.action === 'pick')
  @IsString()
  @MaxLength(40)
  sku?: string;

  @ValidateIf((action: PerformOrderActionDto) => action.action === 'pick')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  @ValidateIf((action: PerformOrderActionDto) => action.action === 'return')
  @IsIn(RETURN_REASONS)
  reason?: ReturnReason;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
