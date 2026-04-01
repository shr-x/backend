import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Store, StoreSchema } from './schemas/store.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { CartService } from './cart/cart.service';
import { PaymentService } from './payment/payment.service';
import { PaymentController } from './payment/payment.controller';
import { AiService } from './ai/ai.service';
import { MarketingService } from './marketing/marketing.service';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { UploadController } from './upload/upload.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    WhatsappModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [AppController, PaymentController, UploadController],
  providers: [AppService, CartService, PaymentService, AiService, MarketingService],
})
export class AppModule {}
