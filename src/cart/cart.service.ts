import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CartService {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get('REDIS_URL');
    const redisHost = this.configService.get('REDIS_HOST');
    
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    } else if (redisHost && redisHost.startsWith('redis://')) {
      this.redis = new Redis(redisHost);
    } else {
      this.redis = new Redis({
        host: redisHost || this.configService.get('REDISHOST', 'localhost'),
        port: this.configService.get('REDIS_PORT') || this.configService.get('REDISPORT', 6379),
        password: this.configService.get('REDIS_PASSWORD') || this.configService.get('REDISPASSWORD'),
      });
    }
  }

  private getCartKey(whatsappNumber: string): string {
    return `cart:${whatsappNumber}`;
  }

  async addItem(whatsappNumber: string, item: any) {
    const key = this.getCartKey(whatsappNumber);
    const cart = await this.getCart(whatsappNumber);
    
    const existingItemIndex = cart.findIndex(i => i.productId === item.productId && i.variantName === item.variantName);
    if (existingItemIndex > -1) {
      cart[existingItemIndex].quantity += item.quantity;
    } else {
      cart.push(item);
    }

    await this.redis.set(key, JSON.stringify(cart), 'EX', 3600 * 24); // Expire in 24h
  }

  async getCart(whatsappNumber: string): Promise<any[]> {
    const key = this.getCartKey(whatsappNumber);
    const cartStr = await this.redis.get(key);
    return cartStr ? JSON.parse(cartStr) : [];
  }

  async clearCart(whatsappNumber: string) {
    const key = this.getCartKey(whatsappNumber);
    await this.redis.del(key);
  }

  async removeItem(whatsappNumber: string, productId: string) {
    const key = this.getCartKey(whatsappNumber);
    const cart = await this.getCart(whatsappNumber);
    const newCart = cart.filter(i => i.productId !== productId);
    await this.redis.set(key, JSON.stringify(newCart), 'EX', 3600 * 24);
  }
}
