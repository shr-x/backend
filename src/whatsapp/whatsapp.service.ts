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
    }
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

  async sendMenu(to: string, storeId: string) {
    const products = await this.productModel.find({ storeId, isAvailable: true });
    const categories = [...new Set(products.map(p => p.category))];

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
                title: cat,
              })),
            },
          ],
        },
      },
    });
  }

  async handleWebhook(body: any) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const storeNumber = value?.metadata?.display_phone_number;
    const store = await this.storeModel.findOne({ whatsappNumber: storeNumber });

    if (!store) {
      this.logger.warn(`Store not found for number: ${storeNumber}`);
      return;
    }

    // Check if store is open
    if (!this.isStoreOpen(store)) {
      await this.sendWhatsAppMessage(from, {
        type: 'text',
        text: { body: `Sorry, ${store.name} is currently closed. Our operating hours are ${store.operatingHours.open} to ${store.operatingHours.close}. Please visit us again during these hours! 🕒` }
      });
      return;
    }

    // Logic for different message types
    if (message.type === 'text') {
      const text = message.text.body.toLowerCase();
      if (text === 'hi' || text === 'hello') {
        await this.sendWelcomeMessage(from, store);
      } else if (text.length > 5 && text.includes(' ')) {
        // Use AI for general queries
        const products = await this.productModel.find({ storeId: store._id, isAvailable: true });
        const context = `Shop: ${store.name}. Available items: ${products.map(p => p.name).join(', ')}.`;
        const aiResponse = await this.aiService.generateResponse(text, context);
        await this.sendWhatsAppMessage(from, { type: 'text', text: { body: aiResponse } });
      } else {
        // Assume this is an address for checkout
        await this.processCheckoutWithAddress(from, store._id.toString(), text);
      }
    } else if (message.type === 'location') {
      const location = message.location;
      await this.processCheckoutWithLocation(from, store._id.toString(), location);
    } else if (message.type === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id;
        if (buttonId === 'view_menu') {
          await this.sendMenu(from, store._id.toString());
        } else if (buttonId === 'view_cart') {
          await this.sendCartSummary(from, store._id.toString());
        } else if (buttonId === 'checkout') {
          await this.startCheckout(from, store._id.toString());
        }
      } else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id;
        if (listId.startsWith('cat_')) {
          const category = listId.replace('cat_', '');
          await this.sendCategoryProducts(from, store._id.toString(), category);
        } else if (listId.startsWith('prod_')) {
          const productId = listId.replace('prod_', '');
          await this.sendProductVariants(from, productId);
        } else if (listId.startsWith('var_')) {
          const [productId, variantIndex] = listId.replace('var_', '').split(':');
          await this.addToCart(from, store._id.toString(), productId, parseInt(variantIndex));
        }
      }
    }
  }

  async sendCategoryProducts(to: string, storeId: string, category: string) {
    const products = await this.productModel.find({ storeId, category, isAvailable: true });

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: `${category} Items` },
        body: { text: 'Choose an item to see options.' },
        action: {
          button: 'Select Item',
          sections: [
            {
              title: category,
              rows: products.map(p => ({
                id: `prod_${p._id}`,
                title: p.name,
                description: `From ₹${p.basePrice}`,
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
        header: { type: 'text', text: product.name },
        body: { text: 'Select a variant to add to cart.' },
        action: {
          button: 'Select Variant',
          sections: [
            {
              title: 'Available Options',
              rows: product.variants.map((v, idx) => ({
                id: `var_${productId}:${idx}`,
                title: v.name,
                description: `Price: ₹${v.price}`,
              })),
            },
          ],
        },
      },
    });
  }

  async addToCart(to: string, storeId: string, productId: string, variantIndex: number) {
    const product = await this.productModel.findById(productId);
    if (!product || !product.variants[variantIndex]) return;

    const variant = product.variants[variantIndex];
    await this.cartService.addItem(to, storeId, {
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

   async sendCartSummary(to: string, storeId: string) {
     const cart = await this.cartService.getCart(to, storeId);
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
             { type: 'reply', reply: { id: 'view_menu', title: 'Add More' } },
             { type: 'reply', reply: { id: 'checkout', title: 'Checkout' } },
           ],
         },
       },
     });
   }

   async startCheckout(to: string, storeId: string) {
     const cart = await this.cartService.getCart(to, storeId);
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

    async processCheckoutWithAddress(to: string, storeId: string, address: string) {
      const cart = await this.cartService.getCart(to, storeId);
      if (cart.length === 0) return;

      const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

      // Create or update customer
      let customer = await this.customerModel.findOne({ whatsappNumber: to, storeId });
      if (!customer) {
        customer = await this.customerModel.create({ whatsappNumber: to, storeId, address });
      } else {
        customer.address = address;
        await customer.save();
      }

      const order = await this.orderModel.create({
        storeId,
        customerId: customer._id,
        items: cart,
        totalAmount: total,
        deliveryAddress: address,
      });

      const razorpayOrder = await this.paymentService.createOrder(total, 'INR', order._id.toString());
      const paymentLink = this.paymentService.getPaymentLink(razorpayOrder.id, total);

      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Great! Your order of ₹${total} is ready. Please complete the payment using this link: ${paymentLink}\n\nOrder ID: ${order._id}` },
      });

      await this.cartService.clearCart(to, storeId);
    }

    async processCheckoutWithLocation(to: string, storeId: string, location: any) {
      const cart = await this.cartService.getCart(to, storeId);
      if (cart.length === 0) return;

      const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

      let customer = await this.customerModel.findOne({ whatsappNumber: to, storeId });
      if (!customer) {
        customer = await this.customerModel.create({
          whatsappNumber: to,
          storeId,
          location: { type: 'Point', coordinates: [location.longitude, location.latitude] },
        });
      } else {
        customer.location = { type: 'Point', coordinates: [location.longitude, location.latitude] };
        await customer.save();
      }

      const order = await this.orderModel.create({
        storeId,
        customerId: customer._id,
        items: cart,
        totalAmount: total,
        deliveryLocation: { type: 'Point', coordinates: [location.longitude, location.latitude] },
      });

      const razorpayOrder = await this.paymentService.createOrder(total, 'INR', order._id.toString());
      const paymentLink = this.paymentService.getPaymentLink(razorpayOrder.id, total);

      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Location received! Your order of ₹${total} is ready. Please complete the payment: ${paymentLink}\n\nOrder ID: ${order._id}` },
      });

      await this.cartService.clearCart(to, storeId);
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
