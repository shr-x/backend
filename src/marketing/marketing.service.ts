import { Injectable } from '@nestjs/common';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from '../schemas/customer.schema';

@Injectable()
export class MarketingService {
  constructor(
    private whatsappService: WhatsappService,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  async broadcastOffer(storeId: string, message: string, imageUrl?: string) {
    const customers = await this.customerModel.find().exec();
    for (const customer of customers) {
      if (imageUrl) {
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, {
          type: 'image',
          image: { 
            link: imageUrl,
            caption: message
          },
        });
      } else {
        await this.whatsappService.sendWhatsAppMessage(customer.whatsappNumber, {
          type: 'text',
          text: { body: message },
        });
      }
    }
  }

  async sendAbandonedCartReminder(to: string, cartSummary: string) {
    await this.whatsappService.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `Hey! You left some fresh items in your cart:\n\n${cartSummary}\n\nWould you like to complete your order?` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'checkout', title: 'Checkout Now' } },
            { type: 'reply', reply: { id: 'view_menu', title: 'View Menu' } },
          ],
        },
      },
    });
  }
}
