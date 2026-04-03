import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema()
class ProductVariant {
  @Prop({ required: true })
  name: string; // e.g., 500g, 1kg, Curry Cut

  @Prop({ required: true })
  price: number;

  @Prop({ default: 100 })
  stock: number;
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: false })
  storeId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  basePrice: number;

  @Prop()
  mrp?: number;

  @Prop()
  offerPrice?: number;

  @Prop({ default: 'kg' })
  unit: string;

  @Prop({ required: true, enum: ['chicken', 'fish', 'seafood'] })
  category: string;

  @Prop()
  image: string;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ default: true })
  inStock: boolean;

  @Prop({ default: false })
  onOffer: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [ProductVariant] })
  variants: ProductVariant[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
