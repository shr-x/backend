import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Store } from './schemas/store.schema';
import { Product } from './schemas/product.schema';
import { Model } from 'mongoose';

const productsData = [
  // Chicken
  { name: 'Chicken Curry Cut (with skin)', category: 'chicken', basePrice: 250, description: 'Fresh farm chicken with skin, perfect for traditional curries.', tags: ['fresh', 'bestseller'] },
  { name: 'Chicken Curry Cut (without skin)', category: 'chicken', basePrice: 270, description: 'Skinless chicken pieces, cleaned and cut for convenience.', tags: ['fresh', 'premium'] },
  { name: 'Chicken Breast', category: 'chicken', basePrice: 380, description: 'Lean and tender chicken breast fillets.', tags: ['high-protein', 'fresh'] },
  { name: 'Chicken Mince', category: 'chicken', basePrice: 390, description: 'Finely minced chicken for kebabs and keema.', tags: ['versatile'] },
  { name: 'Chicken Lollipop', category: 'chicken', basePrice: 330, description: 'Chicken winglets prepared for the perfect appetizer.', tags: ['party-favorite'] },
  { name: 'Chicken Liver', category: 'chicken', basePrice: 110, description: 'Nutrient-rich fresh chicken liver.', tags: ['nutritious'] },
  { name: 'Chicken Whole Leg', category: 'chicken', basePrice: 360, description: 'Juicy whole chicken legs including thigh and drumstick.', tags: ['juicy'] },
  { name: 'Chicken Boneless', category: 'chicken', basePrice: 380, description: 'Tender boneless chicken pieces.', tags: ['convenient'] },
  { name: 'Chicken Drumstick', category: 'chicken', basePrice: 360, description: 'Meaty chicken drumsticks, perfect for roasting or frying.', tags: ['favorite'] },
  { name: 'Chicken Gizzard', category: 'chicken', basePrice: 130, description: 'Fresh and cleaned chicken gizzards.', tags: ['traditional'] },

  // Fish
  { name: 'King Fish', category: 'fish', basePrice: 1000, description: 'Premium King Fish, known for its firm texture and rich flavor.', tags: ['premium', 'seafood-delicacy'] },
  { name: 'Seer Fish Slice', category: 'fish', basePrice: 1650, description: 'Perfectly sliced Seer Fish, the king of coastal delicacies.', tags: ['premium', 'coastal-favorite'] },
  { name: 'Salmon', category: 'fish', basePrice: 1200, description: 'Fresh Salmon fillets, rich in Omega-3.', tags: ['healthy', 'imported'] },
  { name: 'Seabass (Betki)', category: 'fish', basePrice: 680, description: 'Fresh Seabass, ideal for steaming or grilling.', tags: ['freshwater-delight'] },
  { name: 'Rohu', category: 'fish', basePrice: 180, description: 'Freshwater Rohu fish, a staple for everyday meals.', tags: ['daily-staple'] },
  { name: 'Catla', category: 'fish', basePrice: 240, description: 'Fresh Catla fish, known for its sweet taste.', tags: ['freshwater'] },
  { name: 'Red Snapper', category: 'fish', basePrice: 680, description: 'Exotic Red Snapper, perfect for whole roasting.', tags: ['exotic'] },
  { name: 'Pink Perch', category: 'fish', basePrice: 460, description: 'Fresh Pink Perch, great for frying.', tags: ['small-fish'] },

  // Seafood
  { name: 'Prawns', category: 'seafood', basePrice: 550, description: 'Fresh medium-sized prawns, cleaned and deveined.', tags: ['fresh', 'popular'] },
  { name: 'Seer Prawns', category: 'seafood', basePrice: 780, description: 'Large jumbo prawns, perfect for grilling.', tags: ['premium', 'jumbo'] },
  { name: 'Blue Crab', category: 'seafood', basePrice: 750, description: 'Fresh Blue Crabs, known for their sweet meat.', tags: ['seasonal'] },
  { name: 'Squid', category: 'seafood', basePrice: 550, description: 'Fresh Squid rings or whole, ideal for calamari.', tags: ['gourmet'] },
  { name: 'Mussels', category: 'seafood', basePrice: 580, description: 'Fresh cleaned mussels, a seafood lover\'s delight.', tags: ['delicacy'] },
];

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const storeModel = app.get<Model<Store>>(getModelToken(Store.name));
  const productModel = app.get<Model<Product>>(getModelToken(Product.name));

  // 1. Ensure a Store exists
  const store = await storeModel.findOneAndUpdate(
    { whatsappNumber: '15551363886' },
    {
      name: 'The Fresh Meat Co.',
      whatsappNumber: '15551363886',
      address: '123 Butcher Lane, Meat Market',
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      deliveryRadius: 10,
      operatingHours: { open: '08:00', close: '20:00' },
      welcomeMessage: 'Welcome to The Fresh Meat Co.! Order farm-fresh chicken, mutton, and fish delivered to your doorstep. 🍗🥩🐟',
    },
    { upsert: true, new: true }
  );

  console.log('✅ Store verified:', store.name);

  // 2. Clear existing products to avoid duplicates during seeding (optional but cleaner for initial setup)
  // await productModel.deleteMany({ storeId: store._id });

  // 3. Insert Products
  for (const p of productsData) {
    const variants = [
      { name: '250g', price: Math.round(p.basePrice * 0.25), stock: 100 },
      { name: '500g', price: Math.round(p.basePrice * 0.5), stock: 100 },
      { name: '1kg', price: p.basePrice, stock: 100 },
    ];

    await productModel.findOneAndUpdate(
      { storeId: store._id, name: p.name },
      {
        ...p,
        storeId: store._id,
        slug: generateSlug(p.name),
        variants,
        inStock: true,
        isAvailable: true,
        image: `https://placehold.co/400x300?text=${p.name.replace(/\s+/g, '+')}`,
      },
      { upsert: true, new: true }
    );
  }

  console.log(`✅ ${productsData.length} products inserted/updated into the catalog.`);
  await app.close();
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
