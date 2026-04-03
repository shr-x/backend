import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from './schemas/store.schema';
import { Order } from './schemas/order.schema';
import { Customer } from './schemas/customer.schema';
import { Product } from './schemas/product.schema';

@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('store-info')
  async getStoreInfo() {
    // Return the first store found in the DB
    return this.storeModel.findOne().exec();
  }

  @Post('store-info')
  async updateStoreInfo(@Body() storeData: any) {
    // Update the first store found in the DB
    const store = await this.storeModel.findOne().exec();
    if (!store) {
      return this.storeModel.create(storeData);
    }
    return this.storeModel.findByIdAndUpdate(store._id, storeData, { new: true }).exec();
  }

  @Post('rotate-api-key')
  async rotateApiKey() {
    const store = await this.storeModel.findOne().exec();
    if (!store) return { error: 'Store not found' };
    
    // Generate a simple new API key
    const newKey = 'cm_' + Math.random().toString(36).substring(2, 15);
    await this.storeModel.findByIdAndUpdate(store._id, { apiKey: newKey }).exec();
    return { apiKey: newKey };
  }

  @Get('customers')
  async getCustomers() {
    return this.customerModel.find().exec();
  }

  @Get('search')
  async search(@Query('q') query: string) {
    if (!query) return { orders: [], customers: [], products: [] };
    
    const regex = new RegExp(query, 'i');
    
    const [orders, customers, products] = await Promise.all([
      this.orderModel.find({ 
        $or: [
          { _id: query.length === 24 ? query : undefined }, // Only search by ID if valid length
          { status: regex }
        ] 
      }).populate('customerId').limit(5).exec(),
      this.customerModel.find({ 
        $or: [
          { name: regex },
          { whatsappNumber: regex }
        ] 
      }).limit(5).exec(),
      this.productModel.find({ 
        $or: [
          { name: regex },
          { category: regex },
          { description: regex }
        ] 
      }).limit(5).exec()
    ]);

    return { 
      orders: orders.filter(o => o), // Filter out nulls from invalid IDs
      customers, 
      products 
    };
  }

  @Get('dashboard-stats')
  async getDashboardStats() {
    const orders = await this.orderModel.find().exec();
    const customers = await this.customerModel.countDocuments().exec();
    
    const totalRevenue = orders
      .filter(o => o.status === 'delivered' || o.status === 'paid')
      .reduce((acc, o) => acc + o.totalAmount, 0);
    
    const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;

    return {
      totalRevenue,
      activeOrders,
      totalCustomers: customers,
      avgFulfillment: '45 mins',
    };
  }
}
