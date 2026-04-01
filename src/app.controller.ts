import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from './schemas/store.schema';
import { Order } from './schemas/order.schema';
import { Customer } from './schemas/customer.schema';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/store-info')
  async getStoreInfo() {
    // Return the first store found in the DB
    return this.storeModel.findOne().exec();
  }

  @Get('api/dashboard-stats')
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
