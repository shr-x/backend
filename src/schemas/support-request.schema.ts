import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportRequestDocument = SupportRequest & Document;

@Schema({ timestamps: true })
export class SupportRequest {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ required: true })
  whatsappNumber: string;

  @Prop({ default: 'open', enum: ['open', 'resolved', 'closed'] })
  status: string;

  @Prop()
  message?: string;
}

export const SupportRequestSchema = SchemaFactory.createForClass(SupportRequest);
