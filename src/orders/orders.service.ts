import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { UpdateOrderDto } from './dto/update-order.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly whatsappService: WhatsappService,
  ) {}

  async findAll(storeId?: string): Promise<Order[]> {
    if (storeId) {
      return this.orderModel.find({ storeId }).populate('customerId').sort({ createdAt: -1 }).exec();
    }
    return this.orderModel.find().populate('customerId').sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Order | null> {
    return this.orderModel.findById(id).populate('customerId').exec();
  }

  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order | null> {
    const updatedOrder = await this.orderModel.findByIdAndUpdate(id, updateOrderDto, { new: true }).populate('customerId').exec();
    
    if (updatedOrder) {
      const customer = updatedOrder.customerId as any;
      const message = `Your order #${updatedOrder._id} has been updated to: ${updatedOrder.status}`;
      this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, { type: 'text', text: { body: message } });
    }

    return updatedOrder;
  }
}
