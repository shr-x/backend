import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  eta?: string;

  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @IsArray()
  @IsOptional()
  items?: any[];
}
