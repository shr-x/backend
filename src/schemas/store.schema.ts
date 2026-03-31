import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StoreDocument = Store & Document;

@Schema({ timestamps: true })
export class Store {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  whatsappNumber: string;

  @Prop()
  apiKey: string;

  @Prop()
  address: string;

  @Prop({ type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } })
  location: { type: string; coordinates: number[] };

  @Prop({ default: 5 }) // radius in km
  deliveryRadius: number;

  @Prop({ type: Object })
  operatingHours: { open: string; close: string };

  @Prop({ default: 'active' })
  subscriptionStatus: string;

  @Prop()
  logo: string;

  @Prop()
  banner: string;

  @Prop({ default: 'Welcome to our store!' })
  welcomeMessage: string;
}

export const StoreSchema = SchemaFactory.createForClass(Store);
StoreSchema.index({ location: '2dsphere' });
