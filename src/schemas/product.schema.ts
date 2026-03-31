import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema()
class Variant {
  @Prop({ required: true })
  name: string; // e.g., 500g, 1kg, Curry Cut, Skinless

  @Prop({ required: true })
  price: number;

  @Prop()
  stock: number;
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  storeId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  basePrice: number;

  @Prop({ default: 'kg' })
  unit: string;

  @Prop()
  category: string;

  @Prop()
  image: string;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ type: [Variant] })
  variants: Variant[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
