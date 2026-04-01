import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Store } from './schemas/store.schema';
import { Product } from './schemas/product.schema';
import { Model, Types } from 'mongoose';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const storeModel = app.get<Model<Store>>(getModelToken(Store.name));
  const productModel = app.get<Model<Product>>(getModelToken(Product.name));

  // 1. Create a Meat Shop Store
  // IMPORTANT: Replace '919876543210' with your actual WhatsApp Business Number (without +)
  const store = await storeModel.findOneAndUpdate(
    { whatsappNumber: '919876543210' },
    {
      name: 'The Fresh Meat Co.',
      whatsappNumber: '919876543210', // Your WhatsApp Business Phone Number
      address: '123 Butcher Lane, Meat Market',
      location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // Bangalore
      deliveryRadius: 10,
      operatingHours: { open: '08:00', close: '20:00' },
      welcomeMessage: 'Welcome to The Fresh Meat Co.! Order farm-fresh chicken, mutton, and fish delivered to your doorstep. 🍗🥩🐟',
    },
    { upsert: true, new: true }
  );

  console.log('✅ Store created:', store.name);

  // 2. Create Products
  const products = [
    {
      storeId: store._id,
      name: 'Premium Chicken Curry Cut',
      description: 'Fresh farm-raised chicken, cleaned and cut into medium pieces.',
      basePrice: 280,
      category: 'Chicken',
      variants: [
        { name: '500g', price: 150, stock: 50 },
        { name: '1kg', price: 280, stock: 30 },
      ],
      isAvailable: true,
    },
    {
      storeId: store._id,
      name: 'Tender Mutton Bone-in',
      description: 'Succulent pieces of goat meat with bone, perfect for curries.',
      basePrice: 850,
      category: 'Mutton',
      variants: [
        { name: '500g', price: 450, stock: 20 },
        { name: '1kg', price: 850, stock: 15 },
      ],
      isAvailable: true,
    },
    {
      storeId: store._id,
      name: 'Fresh Rohu Fish',
      description: 'Whole Rohu fish cleaned and cut into slices.',
      basePrice: 400,
      category: 'Fish',
      variants: [
        { name: '500g', price: 210, stock: 10 },
        { name: '1kg', price: 400, stock: 5 },
      ],
      isAvailable: true,
    },
  ];

  for (const p of products) {
    await productModel.findOneAndUpdate(
      { storeId: store._id, name: p.name },
      p,
      { upsert: true }
    );
  }

  console.log('✅ Sample products added.');
  await app.close();
}

seed();
