import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { Store, StoreSchema } from '../schemas/store.schema';
import { Product, ProductSchema } from '../schemas/product.schema';
import { Customer, CustomerSchema } from '../schemas/customer.schema';
import { Order, OrderSchema } from '../schemas/order.schema';
import { SupportRequest, SupportRequestSchema } from '../schemas/support-request.schema';
import { CartService } from '../cart/cart.service';
import { AiService } from '../ai/ai.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: SupportRequest.name, schema: SupportRequestSchema },
    ]),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, CartService, AiService],
  exports: [WhatsappService, AiService],
})
export class WhatsappModule {}
