import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Store, StoreDocument } from '../schemas/store.schema';
import { Product, ProductDocument } from '../schemas/product.schema';
import { Customer, CustomerDocument } from '../schemas/customer.schema';
import { Order, OrderDocument } from '../schemas/order.schema';
import { CartService } from '../cart/cart.service';
import { PaymentService } from '../payment/payment.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly fbApiUrl = 'https://graph.facebook.com/v17.0';

  constructor(
    private configService: ConfigService,
    private cartService: CartService,
    private paymentService: PaymentService,
    private aiService: AiService,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async sendWhatsAppMessage(to: string, payload: any) {
    const phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.configService.get('WHATSAPP_TOKEN');

    try {
      await axios.post(
        `${this.fbApiUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          ...payload,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    } catch (error) {
      this.logger.error('Error sending WhatsApp message', error.response?.data || error.message);
      this.logger.error('Failed Payload:', JSON.stringify(payload, null, 2));
    }
  }

  private truncate(str: string, length: number): string {
    if (!str) return '';
    return str.length > length ? str.substring(0, length - 3) + '...' : str;
  }

  async sendWelcomeMessage(to: string, store: StoreDocument) {
    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: store.name },
        body: { text: store.welcomeMessage || 'Welcome to our meat shop! How can we help you today?' },
        footer: { text: 'Powered by MeatSaaS' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'view_menu', title: 'View Menu' } },
            { type: 'reply', reply: { id: 'todays_offers', title: 'Today\'s Offers' } },
            { type: 'reply', reply: { id: 'order_now', title: 'Order Now' } },
          ],
        },
      },
    });
  }

  async sendMenu(to: string) {
    this.logger.log(`Searching all available products for menu`);
    
    const products = await this.productModel.find({ 
      isAvailable: true 
    }).exec();

    this.logger.log(`Found ${products.length} products`);

    if (products.length === 0) {
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Sorry, we couldn't find any products in our catalog right now. Please check back later!` },
      });
      return;
    }

    const categories = [...new Set(products.map(p => p.category))];
    this.logger.log(`Categories: ${categories.join(', ')}`);

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Our Menu' },
        body: { text: 'Please select a category to view items.' },
        action: {
          button: 'Select Category',
          sections: [
            {
              title: 'Meat Categories',
              rows: categories.map(cat => ({
                id: `cat_${cat}`,
                title: this.truncate(cat, 24),
              })),
            },
          ],
        },
      },
    });
  }

  async handleWebhook(body: any) {
    this.logger.log('Incoming Webhook Body:', JSON.stringify(body, null, 2));
    
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      this.logger.log('No message found in webhook');
      return;
    }

    const from = message.from;
    const rawStoreNumber = value?.metadata?.display_phone_number;
    const normalizedStoreNumber = rawStoreNumber?.replace(/\D/g, '');
    
    this.logger.log(`Lookup store for number: ${rawStoreNumber} (normalized: ${normalizedStoreNumber})`);
    
    const store = await this.storeModel.findOne({ 
      whatsappNumber: { $in: [normalizedStoreNumber, rawStoreNumber] } 
    });

    if (!store) {
      this.logger.warn(`Store NOT found for number: ${rawStoreNumber}`);
      return;
    }

    this.logger.log(`Found store: ${store.name} (${store._id})`);

    // Check if store is open
    if (!this.isStoreOpen(store)) {
      this.logger.log(`Store ${store.name} is CLOSED`);
      await this.sendWhatsAppMessage(from, {
        type: 'text',
        text: { body: `Sorry, ${store.name} is currently closed. Our operating hours are ${store.operatingHours.open} to ${store.operatingHours.close}. Please visit us again during these hours! 🕒` }
      });
      return;
    }

    // Logic for different message types
    if (message.type === 'text') {
      const text = message.text.body.toLowerCase();
      this.logger.log(`Received text message: ${text}`);
      
      if (text === 'hi' || text === 'hello') {
        await this.sendWelcomeMessage(from, store);
      } else if (text.length > 5 && text.includes(' ')) {
        // Use AI for general queries
        const customer = await this.customerModel.findOne({ whatsappNumber: from, storeId: store._id });
        const pastOrders = customer ? await this.orderModel.find({ customerId: customer._id }) : [];
        const products = await this.productModel.find({ storeId: store._id, isAvailable: true });
        const context = `Shop: ${store.name}. Available items: ${products.map(p => p.name).join(', ')}.`;
        const aiResponse = await this.aiService.generateResponse(text, context, pastOrders);
        await this.sendWhatsAppMessage(from, { type: 'text', text: { body: aiResponse } });
      } else {
        // Assume this is an address for checkout
        await this.processCheckoutWithAddress(from, text);
      }
    } else if (message.type === 'location') {
      this.logger.log('Received location message');
      const location = message.location;
      await this.processCheckoutWithLocation(from, location);
    } else if (message.type === 'interactive') {
      const interactive = message.interactive;
      this.logger.log(`Received interactive message: ${interactive.type}`);
      
      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id;
        this.logger.log(`Button ID: ${buttonId}`);
        
        if (buttonId === 'view_menu' || buttonId === 'todays_offers' || buttonId === 'order_now' || buttonId === 'view_menu_again') {
          await this.sendMenu(from);
        } else if (buttonId === 'view_cart') {
          await this.sendCartSummary(from);
        } else if (buttonId === 'checkout') {
          await this.startCheckout(from);
        } else {
          this.logger.warn(`Unhandled button ID: ${buttonId}`);
        }
      } else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id;
        this.logger.log(`List ID: ${listId}`);
        
        if (listId.startsWith('cat_')) {
          const category = listId.replace('cat_', '');
          await this.sendCategoryProducts(from, category);
        } else if (listId.startsWith('prod_')) {
          const productId = listId.replace('prod_', '');
          await this.sendProductVariants(from, productId);
        } else if (listId.startsWith('var_')) {
          const [productId, variantIndex] = listId.replace('var_', '').split(':');
          await this.addToCart(from, productId, parseInt(variantIndex));
        }
      }
    }
  }

  async sendCategoryProducts(to: string, category: string) {
    const products = await this.productModel.find({ 
      category, 
      isAvailable: true 
    });

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.truncate(`${category} Items`, 60) },
        body: { text: 'Choose an item to see options.' },
        action: {
          button: 'Select Item',
          sections: [
            {
              title: this.truncate(category, 24),
              rows: products.map(p => ({
                id: `prod_${p._id}`,
                title: this.truncate(p.name, 24),
                description: this.truncate(`From ₹${p.basePrice}`, 72),
              })),
            },
          ],
        },
      },
    });
  }

  async sendProductVariants(to: string, productId: string) {
    const product = await this.productModel.findById(productId);
    if (!product) return;

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.truncate(product.name, 60) },
        body: { text: 'Select a variant to add to cart.' },
        action: {
          button: 'Select Variant',
          sections: [
            {
              title: 'Available Options',
              rows: product.variants.map((v, idx) => ({
                id: `var_${productId}:${idx}`,
                title: this.truncate(v.name, 24),
                description: this.truncate(`Price: ₹${v.price}`, 72),
              })),
            },
          ],
        },
      },
    });
  }

  async addToCart(to: string, productId: string, variantIndex: number) {
    const product = await this.productModel.findById(productId);
    if (!product || !product.variants[variantIndex]) return;

    const variant = product.variants[variantIndex];
    await this.cartService.addItem(to, {
      productId,
      name: product.name,
      variantName: variant.name,
      price: variant.price,
      quantity: 1,
    });

    await this.sendWhatsAppMessage(to, {
       type: 'interactive',
       interactive: {
         type: 'button',
         body: { text: `Added ${product.name} (${variant.name}) to your cart!` },
         action: {
           buttons: [
             { type: 'reply', reply: { id: 'view_cart', title: 'View Cart' } },
             { type: 'reply', reply: { id: 'view_menu', title: 'Add More' } },
             { type: 'reply', reply: { id: 'checkout', title: 'Checkout' } },
           ],
         },
       },
     });
   }

   async sendCartSummary(to: string) {
     const cart = await this.cartService.getCart(to);
     if (cart.length === 0) {
       await this.sendWhatsAppMessage(to, {
         type: 'text',
         text: { body: 'Your cart is empty. View our menu to add items!' },
       });
       return;
     }

     let summary = '*Your Cart:*\n\n';
     let total = 0;
     cart.forEach((item, index) => {
       summary += `${index + 1}. ${item.name} (${item.variantName}) x ${item.quantity} - ₹${item.price * item.quantity}\n`;
       total += item.price * item.quantity;
     });
     summary += `\n*Total: ₹${total}*`;

     await this.sendWhatsAppMessage(to, {
       type: 'interactive',
       interactive: {
         type: 'button',
         body: { text: summary },
         action: {
           buttons: [
             { type: 'reply', reply: { id: 'view_menu_again', title: 'Add More' } },
             { type: 'reply', reply: { id: 'checkout', title: 'Checkout' } },
           ],
         },
       },
     });
   }

   async startCheckout(to: string) {
     const cart = await this.cartService.getCart(to);
     if (cart.length === 0) return;

     let total = 0;
     cart.forEach(item => {
       total += item.price * item.quantity;
     });

     // In a real scenario, we'd check if the user has a saved address.
     // For now, let's ask for the address or location.
     await this.sendWhatsAppMessage(to, {
       type: 'text',
       text: { body: `Your total is ₹${total}. Please share your delivery address or send your live location.` },
     });
     
     // Note: We would usually store the state "AWAITING_ADDRESS" in Redis for this user.
    }

    async processCheckoutWithAddress(to: string, address: string) {
      const cart = await this.cartService.getCart(to);
      if (cart.length === 0) return;

      const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const store = await this.storeModel.findOne(); // Just get the single store
      
      const customer = await this.customerModel.findOneAndUpdate(
        { whatsappNumber: to },
        { name: 'WhatsApp Customer', whatsappNumber: to, storeId: store?._id },
        { upsert: true, new: true }
      );

      const order = await this.orderModel.create({
        customerId: customer._id,
        storeId: store?._id,
        items: cart,
        totalAmount: total,
        status: 'preparing',
        deliveryAddress: address,
      } as any);

      await this.cartService.clearCart(to);
      
      const orderId = (order as any)._id;
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Thank you! Your order #${orderId.toString().slice(-6).toUpperCase()} for ₹${total} has been placed. We'll notify you when it's out for delivery!` },
      });
    }

    async processCheckoutWithLocation(to: string, location: any) {
      const cart = await this.cartService.getCart(to);
      if (cart.length === 0) return;

      const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const store = await this.storeModel.findOne();

      const customer = await this.customerModel.findOneAndUpdate(
        { whatsappNumber: to },
        { name: 'WhatsApp Customer', whatsappNumber: to, storeId: store?._id },
        { upsert: true, new: true }
      );

      const order = await this.orderModel.create({
        customerId: customer._id,
        storeId: store?._id,
        items: cart,
        totalAmount: total,
        status: 'preparing',
        deliveryLocation: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
      } as any);

      await this.cartService.clearCart(to);
      
      const orderId = (order as any)._id;
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Thank you! Your order #${orderId.toString().slice(-6).toUpperCase()} for ₹${total} has been placed. We'll notify you when it's out for delivery!` },
      });
    }

    private isStoreOpen(store: StoreDocument): boolean {
      if (!store.operatingHours) return true;
      
      const now = new Date();
      const [openHour, openMin] = store.operatingHours.open.split(':').map(Number);
      const [closeHour, closeMin] = store.operatingHours.close.split(':').map(Number);
      
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      
      const currentTime = currentHour * 60 + currentMin;
      const openTime = openHour * 60 + openMin;
      const closeTime = closeHour * 60 + closeMin;
      
      return currentTime >= openTime && currentTime <= closeTime;
    }
  }
