import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ORDER_STATUSES } from '../domain/order';

const queryStatuses = [...ORDER_STATUSES, 'all'];

export class ListOrdersQueryDto {
  @IsOptional()
  @IsIn(queryStatuses)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
