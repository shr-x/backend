import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async generateResponse(prompt: string, context: string): Promise<string> {
    const fullPrompt = `
      You are an AI assistant for a premium meat shop. 
      Context: ${context}
      User Question: ${prompt}
      
      Instructions:
      1. Be helpful, polite, and professional.
      2. If the user asks about availability, price, or products, use the provided context.
      3. Keep responses concise and suitable for WhatsApp.
      4. If you don't know the answer, ask them to wait for a human representative.
    `;

    try {
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      return "I'm sorry, I'm having trouble processing your request. Please try again later or wait for a shop representative.";
    }
  }
}
