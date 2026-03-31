import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true })
  storeId: Types.ObjectId;

  @Prop()
  name: string;

  @Prop({ required: true })
  whatsappNumber: string;

  @Prop()
  address: string;

  @Prop({ type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } })
  location: { type: string; coordinates: number[] };

  @Prop({ type: Object })
  preferences: { lastOrder: Date; favoriteItems: string[] };
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ location: '2dsphere' });
CustomerSchema.index({ whatsappNumber: 1, storeId: 1 }, { unique: true });
