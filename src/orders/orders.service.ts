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
    try {
      const updatedOrder = await this.orderModel.findByIdAndUpdate(id, updateOrderDto, { new: true }).populate('customerId').exec();
      
      if (updatedOrder) {
        const customer = updatedOrder.customerId as any;
        const orderIdShort = updatedOrder._id.toString().slice(-6).toUpperCase();
        
        if (updateOrderDto.status === 'confirmed') {
          const itemsText = updatedOrder.items.map(i => `• ${i.quantity}kg x ${i.name}`).join('\n');
          const message = `✅ *Order #${orderIdShort} Verified!*\n\nOur team has verified your order details:\n\n${itemsText}\n\n*Final Total: ₹${updatedOrder.totalAmount}*\n\nDo you want to proceed with this order?`;
          
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
    } catch (error) {
      console.error('Order Update Error:', error);
      throw error;
    }
  }

  async exportReport(): Promise<{ csv: string; filename: string }> {
    try {
      const orders = await this.orderModel.find().populate('customerId').sort({ createdAt: -1 }).exec();
      
      // Simple CSV generation
      let csv = 'Order ID,Customer,Phone,Amount,Status,Date\n';
      orders.forEach(o => {
        try {
          const orderAny = o as any;
          const date = orderAny.createdAt ? new Date(orderAny.createdAt).toLocaleDateString() : 'N/A';
          const customer: any = o.customerId;
          const customerName = customer?.name || 'Unknown';
          const phone = customer?.whatsappNumber || 'N/A';
          
          // Ensure values don't contain commas that break CSV
          const safeName = customerName.replace(/,/g, '');
          const safeStatus = (o.status || 'pending').replace(/,/g, '');
          
          csv += `${o._id},"${safeName}",${phone},${o.totalAmount || 0},${safeStatus},${date}\n`;
        } catch (e) {
          console.error(`Error processing order ${o._id} for report:`, e);
        }
      });

      return { 
        csv, 
        filename: `report-${new Date().toISOString().split('T')[0]}.csv` 
      };
    } catch (error) {
      console.error('Export Report Error:', error);
      throw error;
    }
  }
}
