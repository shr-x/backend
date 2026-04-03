import { Controller, Get, Query, Post, Body, Patch, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from './schemas/store.schema';
import { Order } from './schemas/order.schema';
import { Customer } from './schemas/customer.schema';
import { Product } from './schemas/product.schema';
import { SupportRequest } from './schemas/support-request.schema';

@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(SupportRequest.name) private supportModel: Model<SupportRequest>,
  ) {}

  @Get('support-requests')
  async getSupportRequests() {
    return this.supportModel.find().populate('customerId').populate('orderId').sort({ createdAt: -1 }).exec();
  }

  @Patch('support-requests/:id')
  async updateSupportStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.supportModel.findByIdAndUpdate(id, { status: body.status }, { new: true }).exec();
  }

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
    const productsCount = await this.productModel.countDocuments({ isAvailable: true }).exec();
    
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    const totalRevenue = deliveredOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    
    const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;

    // Calculate average fulfillment time
    let avgFulfillment = '45 mins';
    if (deliveredOrders.length > 0) {
      const times = deliveredOrders
        .filter(o => (o as any).createdAt && (o as any).updatedAt)
        .map(o => (new Date((o as any).updatedAt).getTime() - new Date((o as any).createdAt).getTime()) / (1000 * 60));
      
      if (times.length > 0) {
        const avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        avgFulfillment = `${avgMinutes} mins`;
      }
    }

    return {
      totalRevenue,
      activeOrders,
      totalCustomers: customers,
      totalProducts: productsCount,
      avgFulfillment,
    };
  }
}
