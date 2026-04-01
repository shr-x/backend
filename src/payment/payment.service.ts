import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';

@Injectable()
export class PaymentService {
  private razorpay: any;

  constructor(private configService: ConfigService) {
    if (this.configService.get('DEMO_MODE') !== 'true') {
      this.razorpay = new Razorpay({
        key_id: this.configService.get('RAZORPAY_KEY_ID'),
        key_secret: this.configService.get('RAZORPAY_KEY_SECRET'),
      });
    }
  }

  async createOrder(amount: number, currency: string = 'INR', receipt: string) {
    if (this.configService.get('DEMO_MODE') === 'true') {
      return {
        id: `demo_${Date.now()}`,
        amount: amount * 100,
        currency,
        receipt,
        status: 'created',
        demo: true,
      };
    }

    const options = {
      amount: amount * 100, // amount in the smallest currency unit
      currency,
      receipt,
    };
    return await this.razorpay.orders.create(options);
  }

  getPaymentLink(orderId: string, amount: number) {
    if (this.configService.get('DEMO_MODE') === 'true') {
      return `https://demo-payment.meatsaas.com/pay?orderId=${orderId}&amount=${amount}`;
    }
    // In production, you'd use Razorpay Payment Links or a custom checkout page
    return `https://checkout.meatsaas.com/pay/${orderId}`;
  }
}
