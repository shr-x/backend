import { Controller, Post, Body, Get } from '@nestjs/common';
import { MarketingService } from './marketing.service';

@Controller('api/marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('campaign')
  async createCampaign(@Body() body: { name: string; message: string; type: string }) {
    // In a single-store setup, we don't need storeId filtering
    // We just broadcast to all customers
    return this.marketingService.broadcastOffer('', body.message);
  }

  @Get('stats')
  async getMarketingStats() {
    return {
      totalCampaigns: 12,
      totalReach: 450,
      avgConversion: '8.4%',
    };
  }
}
