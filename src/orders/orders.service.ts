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
      const orderIdShort = updatedOrder._id.toString().slice(-6).toUpperCase();
      
      if (updateOrderDto.status === 'confirmed') {
        const message = `✅ *Order #${orderIdShort} Verified!*\n\nOur team has verified your order. The final adjusted amount is *₹${updatedOrder.totalAmount}*.\n\nDo you want to proceed with this order?`;
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: message },
            action: {
              buttons: [
                { type: 'reply', reply: { id: `opt_confirm:${updatedOrder._id}`, title: 'Confirm Order' } },
                { type: 'reply', reply: { id: `opt_cancel:${updatedOrder._id}`, title: 'Cancel Order' } },
              ],
            },
          },
        });
      } else if (updateOrderDto.status === 'cancelled') {
        const message = `❌ Your order #${orderIdShort} has been cancelled by the shop.`;
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, { type: 'text', text: { body: message } });
      } else if (updateOrderDto.status === 'out_for_delivery') {
        const message = `🚚 Your order #${orderIdShort} is out for delivery! Please keep ₹${updatedOrder.totalAmount} ready for COD.`;
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, { type: 'text', text: { body: message } });
      } else {
        const message = `Order #${orderIdShort} status updated to: ${updatedOrder.status}`;
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, { type: 'text', text: { body: message } });
      }
    }

    return updatedOrder;
  }
}
