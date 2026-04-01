import { IsString, IsOptional } from 'class-validator';

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  eta?: string;
}
