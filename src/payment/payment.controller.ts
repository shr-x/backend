import { Controller, Post, Body, HttpStatus, Res, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Response } from 'express';
import { Order, OrderDocument } from '../schemas/order.schema';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Controller('payment')
export class PaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private whatsappService: WhatsappService,
  ) {}

  @Post('callback')
  async handlePaymentCallback(
    @Body() body: any,
    @Res() res: Response,
  ) {
    const { orderId, paymentId, status } = body;

    const order = await this.orderModel.findById(orderId).populate('storeId').populate('customerId');
    if (!order) return res.sendStatus(HttpStatus.NOT_FOUND);

    if (status === 'success') {
      order.status = 'paid';
      order.paymentStatus = 'success';
      order.paymentId = paymentId;
      await order.save();

      // Notify customer
      await this.whatsappService.sendWhatsAppMessage((order.customerId as any).whatsappNumber, {
        type: 'text',
        text: { body: `Payment successful! Your order #${order._id} is confirmed. We are preparing it now. You will receive an update once it's out for delivery.` },
      });

      // Notify store owner
      await this.whatsappService.sendWhatsAppMessage((order.storeId as any).whatsappNumber, {
        type: 'text',
        text: { body: `New order received! Order #${order._id} for ₹${order.totalAmount}. Please check your dashboard for details.` },
      });
    }

    return res.sendStatus(HttpStatus.OK);
  }
}
