import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Store, StoreDocument } from '../schemas/store.schema';
import { Product, ProductDocument } from '../schemas/product.schema';
import { Customer, CustomerDocument } from '../schemas/customer.schema';
import { Order, OrderDocument } from '../schemas/order.schema';
import { SupportRequest, SupportRequestDocument } from '../schemas/support-request.schema';
import { CartService } from '../cart/cart.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly fbApiUrl = 'https://graph.facebook.com/v17.0';

  constructor(
    private configService: ConfigService,
    private cartService: CartService,
    private aiService: AiService,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(SupportRequest.name) private supportModel: Model<SupportRequestDocument>,
  ) {}

  async sendWhatsAppMessage(to: string, payload: any) {
    const phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.configService.get('WHATSAPP_TOKEN');

    // Filter out unsupported SVG images from the payload
    if (payload.type === 'image' && payload.image?.link && !this.isSupportedImage(payload.image.link)) {
      this.logger.warn(`Rejecting SVG image in payload: ${payload.image.link}. Converting to text.`);
      payload = {
        type: 'text',
        text: { body: payload.image.caption || 'Product image not available in SVG format.' }
      };
    } else if (payload.type === 'interactive' && payload.interactive?.header?.type === 'image' && 
               payload.interactive.header.image?.link && !this.isSupportedImage(payload.interactive.header.image.link)) {
      this.logger.warn(`Removing SVG image from interactive header: ${payload.interactive.header.image.link}`);
      delete payload.interactive.header; // Remove the image header entirely
    }

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
        body: { text: store.welcomeMessage || `Welcome to ${store.name}! How can we help you today?` },
        footer: { text: 'Powered by shr-x.cc' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'view_menu', title: 'View Menu' } },
            { type: 'reply', reply: { id: 'todays_offers', title: 'Today\'s Offers' } },
            { type: 'reply', reply: { id: 'help', title: 'Help' } },
          ],
        },
      },
    });
  }

  async sendTodaysOffers(to: string) {
    const products = await this.productModel.find({ onOffer: true, isAvailable: true });
    if (products.length === 0) {
      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "No special offers today, but our fresh meat is always at great prices!" } });
      return;
    }

    await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "🔥 *Today's Special Deals!* 🔥" } });
    for (const p of products) {
      const priceText = p.offerPrice 
        ? `~₹${p.basePrice}~ *₹${p.offerPrice}*` 
        : `₹${p.basePrice}`;

      const msg: any = {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: `*${p.name}* (ON OFFER!)\n${p.description || ''}\n\nDeal Price: ${priceText}/${p.unit || 'kg'}` },
          action: {
            buttons: [
              { type: 'reply', reply: { id: `prod_${p._id}`, title: 'Select Product' } }
            ],
          },
        },
      };
      if (p.image && this.isSupportedImage(p.image)) {
        msg.interactive.header = { type: 'image', image: { link: p.image } };
      }
      await this.sendWhatsAppMessage(to, msg);
    }
  }

  async sendHelpOptions(to: string) {
    const customer = await this.customerModel.findOne({ whatsappNumber: to });
    if (!customer) {
      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "How can we help you? You can ask me anything about our products or shop!" } });
      return;
    }

    const lastOrders = await this.orderModel.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .exec();

    if (lastOrders.length === 0) {
      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "How can we help you? You can ask me anything about our products or shop!" } });
      return;
    }

    const rows = lastOrders.map(o => ({
      id: `help_order_${o._id}`,
      title: `Order #${o._id.toString().slice(-6).toUpperCase()}`,
      description: `₹${o.totalAmount} • ${o.status.toUpperCase()}`
    }));

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Order Support' },
        body: { text: 'Which order do you need help with?' },
        action: {
          button: 'Select Order',
          sections: [{ title: 'Recent Orders', rows }]
        }
      }
    });
  }

  async handleHelpOrder(to: string, orderId: string) {
    const order = await this.orderModel.findById(orderId);
    if (!order) return;
    
    // Create support request in DB
    await this.supportModel.create({
      customerId: order.customerId,
      orderId: order._id,
      whatsappNumber: to,
      status: 'open',
      message: `User requested help with Order #${orderId.toString().slice(-6).toUpperCase()}`
    });

    await this.sendWhatsAppMessage(to, { 
      type: 'text', 
      text: { body: `I've notified our support team about Order #${orderId.toString().slice(-6).toUpperCase()}. A representative will message you shortly! 🕒` } 
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
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const contact = value?.contacts?.[0];
    const whatsappName = contact?.profile?.name || 'Customer';
    const message = value?.messages?.[0];

    if (!message) {
      if (value?.statuses?.[0]) {
        this.logger.debug(`Status update: ${value.statuses[0].status} for ${value.statuses[0].id}`);
      }
      return;
    }

    const from = message.from;

    // Update or create customer with the real name from WhatsApp
    await this.customerModel.findOneAndUpdate(
      { whatsappNumber: from },
      { $set: { name: whatsappName } },
      { upsert: true, new: true }
    );
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
      } else if (text.match(/(\d+(\.\d+)?)\s*(kg|g|gram|gm)/i) || text.match(/^(\d+(\.\d+)?)$/)) {
        // Handle custom weight input
        await this.handleCustomWeight(from, text);
      } else if (text.startsWith('confirm_')) {
        const orderId = text.replace('confirm_', '');
        await this.finalizeOrder(from, orderId, true);
      } else if (text.startsWith('reject_')) {
        const orderId = text.replace('reject_', '');
        await this.finalizeOrder(from, orderId, false);
      } else {
        // Only allow location checkout. If they send text, check if they have a cart and ask for location.
        const cart = await this.cartService.getCart(from);
        if (cart.length > 0) {
          await this.sendWhatsAppMessage(from, { 
            type: 'text', 
            text: { body: "📍 Please share your *Live Location* using the \"Location\" button in WhatsApp to complete your order. We don't accept typed addresses." } 
          });
        } else {
          // If no cart, maybe use AI to respond
          const customer = await this.customerModel.findOne({ whatsappNumber: from, storeId: store._id });
          const pastOrders = customer ? await this.orderModel.find({ customerId: customer._id }) : [];
          const products = await this.productModel.find({ storeId: store._id, isAvailable: true });
          const context = `Shop: ${store.name}. Available items: ${products.map(p => p.name).join(', ')}.`;
          const aiResponse = await this.aiService.generateResponse(text, context, pastOrders);
          await this.sendWhatsAppMessage(from, { type: 'text', text: { body: aiResponse } });
        }
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
        
        if (buttonId === 'view_menu' || buttonId === 'view_menu_again') {
          await this.sendMenu(from);
        } else if (buttonId === 'todays_offers') {
          await this.sendTodaysOffers(from);
        } else if (buttonId === 'help') {
          await this.sendHelpOptions(from);
        } else if (buttonId === 'view_cart') {
          await this.sendCartSummary(from);
        } else if (buttonId === 'checkout') {
          await this.startCheckout(from);
        } else if (buttonId.startsWith('cart_inc_')) {
          const [productId, variantName] = buttonId.replace('cart_inc_', '').split(':');
          await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
          await this.cartService['redis'].set(`last_variant:${from}`, variantName, 'EX', 300);
          await this.sendWhatsAppMessage(from, { 
            type: 'text', 
            text: { body: `Please enter your desired quantity for *${variantName}* (e.g., 1.5kg or 500g):` } 
          });
        } else if (buttonId.startsWith('cart_dec_')) {
          const [productId, variantName] = buttonId.replace('cart_dec_', '').split(':');
          await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
          await this.cartService['redis'].set(`last_variant:${from}`, variantName, 'EX', 300);
          await this.sendWhatsAppMessage(from, { 
            type: 'text', 
            text: { body: `Please enter your new quantity for *${variantName}* (e.g., 1kg or 250g):` } 
          });
        } else if (buttonId.startsWith('cart_rem_')) {
          const [productId, variantName] = buttonId.replace('cart_rem_', '').split(':');
          const cart = await this.cartService.getCart(from);
          const item = cart.find(i => i.productId === productId && i.variantName === variantName);
          if (item) {
            if (item.quantity > 1) {
              await this.cartService.updateQuantity(from, productId, item.quantity - 1, variantName);
            } else {
              await this.cartService.removeItem(from, productId, variantName);
            }
            await this.sendCartSummary(from);
          }
        } else if (buttonId.startsWith('prod_')) {
          const productId = buttonId.replace('prod_', '');
          await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
          await this.sendProductVariants(from, productId);
        } else if (buttonId.startsWith('qty_')) {
          const [productId, weightStr] = buttonId.replace('qty_', '').split(':');
          if (weightStr === 'custom') {
            await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
            const product = await this.productModel.findById(productId);
            const productName = product ? product.name : 'this item';
            await this.sendWhatsAppMessage(from, { 
              type: 'text', 
              text: { body: `Please enter the quantity of *${productName}* in grams or kg (e.g., 1.5kg or 500g):` } 
            });
          } else {
            const weightInKg = weightStr === '1kg' ? 1 : 0.5;
            await this.addWeightToCart(from, productId, weightInKg);
          }
        } else if (buttonId.startsWith('opt_')) {
          const [action, orderId] = buttonId.replace('opt_', '').split(':');
          await this.finalizeOrder(from, orderId, action === 'confirm');
        } else {
          this.logger.warn(`Unhandled button ID: ${buttonId}`);
        }
      } else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id;
        this.logger.log(`List ID: ${listId}`);

        if (listId === 'view_menu' || listId === 'view_menu_again') {
          await this.sendMenu(from);
        } else if (listId === 'todays_offers') {
          await this.sendTodaysOffers(from);
        } else if (listId === 'view_cart') {
          await this.sendCartSummary(from);
        } else if (listId === 'checkout') {
          await this.startCheckout(from);
        } else if (listId.startsWith('cart_inc_')) {
            const [productId, variantName] = listId.replace('cart_inc_', '').split(':');
            await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
            await this.cartService['redis'].set(`last_variant:${from}`, variantName, 'EX', 300);
            await this.sendWhatsAppMessage(from, { 
              type: 'text', 
              text: { body: `Please enter your desired quantity for *${variantName}* (e.g., 1.5kg or 500g):` } 
            });
          } else if (listId.startsWith('cart_dec_')) {
            const [productId, variantName] = listId.replace('cart_dec_', '').split(':');
            await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
            await this.cartService['redis'].set(`last_variant:${from}`, variantName, 'EX', 300);
            await this.sendWhatsAppMessage(from, { 
              type: 'text', 
              text: { body: `Please enter your new quantity for *${variantName}* (e.g., 1kg or 250g):` } 
            });
          } else if (listId.startsWith('cart_rem_')) {
            const [productId, variantName] = listId.replace('cart_rem_', '').split(':');
            const cart = await this.cartService.getCart(from);
            const item = cart.find(i => i.productId === productId && i.variantName === variantName);
            if (item) {
              if (item.quantity > 1) {
                await this.cartService.updateQuantity(from, productId, item.quantity - 1, variantName);
              } else {
                await this.cartService.removeItem(from, productId, variantName);
              }
              await this.sendCartSummary(from);
            }
          } else if (listId.startsWith('cat_')) {
          const category = listId.replace('cat_', '');
          await this.sendCategoryProducts(from, category);
        } else if (listId.startsWith('prod_')) {
          const productId = listId.replace('prod_', '');
          await this.cartService['redis'].set(`last_prod:${from}`, productId, 'EX', 300);
          await this.sendProductVariants(from, productId);
        } else if (listId.startsWith('help_order_')) {
          const orderId = listId.replace('help_order_', '');
          await this.handleHelpOrder(from, orderId);
        }
      }
    }
  }

  async finalizeOrder(to: string, orderId: string, isConfirmed: boolean) {
    const order = await this.orderModel.findById(orderId);
    if (!order) return;

    // Once an option is selected (confirmed/cancelled/preparing), another choice can't be made.
    if (order.status !== 'confirmed') {
      const orderIdShort = orderId.toString().slice(-6).toUpperCase();
      this.logger.warn(`User ${to} tried to change already finalized order #${orderIdShort} (Status: ${order.status})`);
      
      let responseMsg = '';
      if (order.status === 'preparing' || order.status === 'out_for_delivery' || order.status === 'delivered') {
        responseMsg = `Order #${orderIdShort} is already being processed or delivered. It cannot be changed now.`;
      } else if (order.status === 'cancelled') {
        responseMsg = `Order #${orderIdShort} has already been cancelled.`;
      } else {
        responseMsg = `Order #${orderIdShort} status cannot be changed via this link anymore.`;
      }

      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: responseMsg } });
      return;
    }

    if (isConfirmed) {
      order.status = 'preparing';
      await order.save();
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Awesome! Your order #${orderId.toString().slice(-6).toUpperCase()} is now being prepared. We'll notify you when it's out for delivery! 🍗` }
      });
    } else {
      order.status = 'cancelled';
      await order.save();
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Your order #${orderId.toString().slice(-6).toUpperCase()} has been cancelled. We hope to serve you again soon!` }
      });
    }
  }

  private isSupportedImage(url: string): boolean {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    
    // Check for .svg in the path before query parameters
    const path = lowerUrl.split('?')[0];
    if (path.endsWith('.svg')) return false;
    
    // Check if the URL contains image/svg (often in data URLs or some CDN URLs)
    if (lowerUrl.includes('image/svg')) return false;
    
    // Check if it's a known image format or an uploaded file path
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const isLocalUpload = path.includes('/uploads/');
    
    return supportedExtensions.some(ext => path.endsWith(ext)) || isLocalUpload || !path.includes('.');
  }

  async sendCategoryProducts(to: string, category: string) {
    this.logger.log(`Fetching products for category: "${category}" (to: ${to})`);
    
    // Case-insensitive search
    const products = await this.productModel.find({ 
      category: { $regex: new RegExp(`^${category}$`, 'i') }, 
      isAvailable: true 
    });
    this.logger.log(`Found ${products.length} products in ${category}`);

    if (products.length === 0) {
      this.logger.warn(`No products found for category: ${category}`);
      await this.sendWhatsAppMessage(to, {
        type: 'text',
        text: { body: `Sorry, we couldn't find any items in "${category}". Please try another category!` },
      });
      return;
    }

    // WhatsApp List Messages don't support images directly in rows. 
    // We'll send individual products with images for a better experience.
    for (const p of products) {
      const priceText = p.offerPrice 
        ? `~₹${p.basePrice}~ *₹${p.offerPrice}*` 
        : `₹${p.basePrice}`;

      const message: any = {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: `*${p.name}*\n${p.description || ''}\n\nPrice: ${priceText}/${p.unit || 'kg'}` },
          action: {
            buttons: [
              { type: 'reply', reply: { id: `prod_${p._id}`, title: 'Select Product' } }
            ],
          },
        },
      };

      if (p.image && this.isSupportedImage(p.image)) {
        message.interactive.header = {
          type: 'image',
          image: { link: p.image }
        };
      } else if (p.image) {
        // If image is unsupported, we skip the header image but maybe log it
        this.logger.warn(`Skipping unsupported image for product ${p.name}: ${p.image}`);
      }

      await this.sendWhatsAppMessage(to, message);
    }
  }

  async sendProductVariants(to: string, productId: string) {
    const product = await this.productModel.findById(productId);
    if (!product) return;

    const priceText = product.offerPrice 
      ? `~₹${product.basePrice}~ *₹${product.offerPrice}*` 
      : `₹${product.basePrice}`;

    await this.sendWhatsAppMessage(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `How much *${product.name}* would you like?\n\nPrice: ${priceText}/${product.unit || 'kg'}` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `qty_${productId}:500g`, title: '500 Grams' } },
            { type: 'reply', reply: { id: `qty_${productId}:1kg`, title: '1 KG' } },
            { type: 'reply', reply: { id: `qty_${productId}:custom`, title: 'Custom Weight' } },
          ],
        },
      },
    });
  }

  async handleCustomWeight(to: string, text: string) {
    // Basic regex to find productId in user session or similar.
    const lastProdId = await this.cartService['redis'].get(`last_prod:${to}`);
    const lastVariant = await this.cartService['redis'].get(`last_variant:${to}`);

    if (!lastProdId) {
      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "Please select a product first!" } });
      return;
    }

    let weightInKg = 0;
    const cleanText = text.toLowerCase().replace(/\s+/g, '');
    
    // Match patterns like "500g", "500gram", "500gm", "0.5kg"
    const kgMatch = cleanText.match(/(\d+(\.\d+)?)(kg)/i);
    const gMatch = cleanText.match(/(\d+)(g|gram|gm)/i);
    const justNumberMatch = cleanText.match(/^(\d+(\.\d+)?)$/);

    if (kgMatch) {
      weightInKg = parseFloat(kgMatch[1]);
    } else if (gMatch) {
      weightInKg = parseInt(gMatch[1]) / 1000;
    } else if (justNumberMatch) {
      const num = parseFloat(justNumberMatch[1]);
      if (num >= 50) {
        weightInKg = num / 1000;
      } else {
        weightInKg = num;
      }
    }

    if (weightInKg <= 0) {
      await this.sendWhatsAppMessage(to, { type: 'text', text: { body: "Invalid weight. Please try again (e.g., 1.5kg or 500g)." } });
      return;
    }

    if (lastVariant) {
      // This is an update from the cart review
      await this.cartService.removeItem(to, lastProdId, lastVariant);
      await this.cartService['redis'].del(`last_variant:${to}`);
    }

    await this.addWeightToCart(to, lastProdId, weightInKg);
    
    // If it was a cart update, send summary again
    if (lastVariant) {
      await this.sendCartSummary(to);
    }
  }

  async addWeightToCart(to: string, productId: string, weightInKg: number) {
    const product = await this.productModel.findById(productId);
    if (!product) return;

    const unitPrice = product.offerPrice || product.basePrice;
    const totalPrice = Math.round(unitPrice * weightInKg);
    const weightLabel = weightInKg >= 1 ? `${weightInKg}kg` : `${weightInKg * 1000}g`;

    await this.cartService.addItem(to, {
      productId,
      productName: product.name, // Ensure this field is set for orders
      name: product.name,
      variantName: weightLabel,
      price: unitPrice, // price per kg
      quantity: weightInKg,
      totalPrice: totalPrice
    });

    await this.sendWhatsAppMessage(to, {
       type: 'interactive',
       interactive: {
         type: 'button',
         body: { text: `Added ${weightLabel} of ${product.name} to your cart! (₹${totalPrice})` },
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

  async addToCart(to: string, productId: string, variantIndex: number) {
    const product = await this.productModel.findById(productId);
    if (!product || !product.variants[variantIndex]) return;

    const variant = product.variants[variantIndex];
    await this.cartService.addItem(to, {
      productId,
      productName: product.name,
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

     await this.cartService.setReviewStatus(to, true);

     let summary = '*🛒 Your Cart Review:*\n\n';
     let total = 0;
     cart.forEach((item, index) => {
       summary += `${index + 1}. *${item.name}* (${item.variantName})\n`;
       summary += `   Qty: ${item.quantity} x ₹${item.price} = *₹${item.price * item.quantity}*\n\n`;
       total += item.price * item.quantity;
     });
     summary += `*Total Amount: ₹${total}*\n\n`;
     summary += `_You can adjust quantities or remove items below:_`;

     const sections = cart.map((item) => {
       const itemName = item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name;
       const variantLabel = item.variantName;
       
       return {
         title: `${itemName} (${variantLabel})`.substring(0, 24),
         rows: [
           { 
             id: `cart_inc_${item.productId}:${item.variantName}`, 
             title: '➕ Increase Qty', 
             description: `Set new qty for ${itemName}`.substring(0, 72)
           },
           { 
             id: `cart_dec_${item.productId}:${item.variantName}`, 
             title: '➖ Decrease Qty', 
             description: `Reduce qty for ${itemName}`.substring(0, 72)
           },
           { 
             id: `cart_rem_${item.productId}:${item.variantName}`, 
             title: '🗑️ Remove Item', 
             description: `Remove ${itemName} from cart`.substring(0, 72)
           },
         ],
       };
     });

     await this.sendWhatsAppMessage(to, {
       type: 'interactive',
       interactive: {
         type: 'list',
         header: { type: 'text', text: 'Cart Review' },
         body: { text: summary },
         footer: { text: 'Select an option to manage' },
         action: {
           button: 'Manage Cart',
           sections: [
             {
               title: 'Operations',
               rows: [
                 { id: 'checkout', title: '✅ Checkout', description: 'Proceed to finalize order' },
                 { id: 'view_menu_again', title: '🛍️ Add More', description: 'Browse more items' },
               ]
             },
             ...sections.slice(0, 8) // Max 10 sections total (2 fixed + up to 8 items)
           ],
         },
       },
     });
   }

   async startCheckout(to: string) {
     const cart = await this.cartService.getCart(to);
     if (cart.length === 0) return;

     const hasReviewed = await this.cartService.hasReviewed(to);
     if (!hasReviewed) {
       await this.sendWhatsAppMessage(to, {
         type: 'text',
         text: { body: "⚠️ Please review your cart items before checking out. It only takes a second! 🛒" }
       });
       await this.sendCartSummary(to);
       return;
     }

     let total = 0;
     cart.forEach(item => {
       total += item.price * item.quantity;
     });

     await this.sendWhatsAppMessage(to, {
       type: 'text',
       text: { body: `Your total is *₹${total}*.\n\n *Please note:\n*
      Due to the nature of fresh meat and seafood cutting, the final weight may vary slightly ( a little more or less than requested ). The final billing will be adjusted accordingly based on the exact weight delivered.\n\n📍 Please share your *Live Location* using the "Location" button in WhatsApp for faster delivery. We only accept orders within our delivery range!` },
     });
    }

  async processCheckoutWithLocation(to: string, location: any) {
    const cart = await this.cartService.getCart(to);
    if (cart.length === 0) return;

    const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const store = await this.storeModel.findOne();

    if (store && store.location && store.location.coordinates) {
      const storeLat = store.location.coordinates[1];
      const storeLon = store.location.coordinates[0];
      const distance = this.getDistance(location.latitude, location.longitude, storeLat, storeLon);
      
      const radius = store.deliveryRadius || 5;
      if (distance > radius) {
        await this.sendWhatsAppMessage(to, {
          type: 'text',
          text: { body: `📍 Sorry, you are *${distance.toFixed(1)}*km* away. We only deliver within *${radius})*km* of our shop. Please visit us at our store instead!` }
        });
        return;
      }
    }

    const customer = await this.customerModel.findOneAndUpdate(
      { whatsappNumber: to },
      { whatsappNumber: to, storeId: store?._id },
      { upsert: true, returnDocument: 'after' }
    );

    const order = await this.orderModel.create({
      customerId: customer._id,
      storeId: store?._id,
      items: cart,
      totalAmount: total,
      status: 'pending', // Wait for admin approval
      deliveryLocation: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
      },
    } as any);

    await this.cartService.clearCart(to);
    
    const orderId = (order as any)._id;
    await this.sendWhatsAppMessage(to, {
      type: 'text',
      text: { body: `Thank you! Your order *#${orderId.toString().slice(-6).toUpperCase()}()* for *₹${total}* has been received. Please wait while we verify and confirm your order with the final weight and price. 🕒` },
    });
  }

  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  }

    private isStoreOpen(store: StoreDocument): boolean {
      if (!store.operatingHours) return true;
      
      const now = new Date();
      // Use Intl.DateTimeFormat to get IST components as the store is in India
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find(p => p.type === 'hour');
      const minutePart = parts.find(p => p.type === 'minute');
      
      const currentHour = hourPart ? parseInt(hourPart.value, 10) : now.getHours();
      const currentMin = minutePart ? parseInt(minutePart.value, 10) : now.getMinutes();
      
      const [openHour, openMin] = store.operatingHours.open.split(':').map(Number);
      const [closeHour, closeMin] = store.operatingHours.close.split(':').map(Number);
      
      const currentTime = currentHour * 60 + currentMin;
      const openTime = openHour * 60 + openMin;
      const closeTime = closeHour * 60 + closeMin;
      
      if (closeTime >= openTime) {
        // Normal case: open and close on the same day
        return currentTime >= openTime && currentTime <= closeTime;
      } else {
        // Overnight case: e.g., open at 08:00 and close at 02:00 next day
        return currentTime >= openTime || currentTime <= closeTime;
      }
    }
  }
