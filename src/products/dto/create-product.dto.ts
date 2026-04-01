import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class VariantDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsNumber()
  stock: number;
}

export class CreateProductDto {
  @IsString()
  storeId: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  basePrice: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];
}
