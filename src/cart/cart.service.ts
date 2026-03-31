import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CartService {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }

  private getCartKey(whatsappNumber: string, storeId: string): string {
    return `cart:${storeId}:${whatsappNumber}`;
  }

  async addItem(whatsappNumber: string, storeId: string, item: any) {
    const key = this.getCartKey(whatsappNumber, storeId);
    const cart = await this.getCart(whatsappNumber, storeId);
    
    const existingItemIndex = cart.findIndex(i => i.productId === item.productId && i.variantName === item.variantName);
    if (existingItemIndex > -1) {
      cart[existingItemIndex].quantity += item.quantity;
    } else {
      cart.push(item);
    }

    await this.redis.set(key, JSON.stringify(cart), 'EX', 3600 * 24); // Expire in 24h
  }

  async getCart(whatsappNumber: string, storeId: string): Promise<any[]> {
    const key = this.getCartKey(whatsappNumber, storeId);
    const cartStr = await this.redis.get(key);
    return cartStr ? JSON.parse(cartStr) : [];
  }

  async clearCart(whatsappNumber: string, storeId: string) {
    const key = this.getCartKey(whatsappNumber, storeId);
    await this.redis.del(key);
  }

  async removeItem(whatsappNumber: string, storeId: string, productId: string) {
    const key = this.getCartKey(whatsappNumber, storeId);
    const cart = await this.getCart(whatsappNumber, storeId);
    const newCart = cart.filter(i => i.productId !== productId);
    await this.redis.set(key, JSON.stringify(newCart), 'EX', 3600 * 24);
  }
}
