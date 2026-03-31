import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { Store, StoreSchema } from '../schemas/store.schema';
import { Product, ProductSchema } from '../schemas/product.schema';
import { Customer, CustomerSchema } from '../schemas/customer.schema';
import { Order, OrderSchema } from '../schemas/order.schema';
import { CartService } from '../cart/cart.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, CartService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
