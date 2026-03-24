require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const CatalogItem = require('../models/CatalogItem');

async function seed() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  await CatalogItem.deleteMany({});

  const items = [
    // Subscriptions
    { slug: 'sub-stranger-1m', section: 'subscriptions', productType: 'subscription', title: 'Странник (1 мес)', description: 'Базовая подписка на 1 месяц', priceKopecks: 19900, subscriptionTier: 'stranger', subscriptionPeriodMonths: 1, sortOrder: 1 },
    { slug: 'sub-seeker-1m', section: 'subscriptions', productType: 'subscription', title: 'Искатель (1 мес)', description: 'Продвинутая подписка', priceKopecks: 49900, badge: 'Популярное', subscriptionTier: 'seeker', subscriptionPeriodMonths: 1, sortOrder: 2 },
    { slug: 'sub-legend-1m', section: 'subscriptions', productType: 'subscription', title: 'Легенда (1 мес)', description: 'Максимальная подписка', priceKopecks: 99900, subscriptionTier: 'legend', subscriptionPeriodMonths: 1, sortOrder: 3 },
    { slug: 'sub-seeker-3m', section: 'subscriptions', productType: 'subscription', title: 'Искатель (3 мес)', description: '3 месяца по сниженной цене', priceKopecks: 129900, originalPriceKopecks: 149700, badge: 'Выгодно', subscriptionTier: 'seeker', subscriptionPeriodMonths: 3, sortOrder: 4 },
    // Wallet topup (Mint)
    { slug: 'mint-100-gold', section: 'mint', productType: 'wallet_topup', title: '100 золотых', description: 'Пополнение кошелька', priceKopecks: 9900, walletGoldAmount: 100, sortOrder: 1 },
    { slug: 'mint-500-gold', section: 'mint', productType: 'wallet_topup', title: '500 золотых', description: 'Пополнение с бонусом', priceKopecks: 39900, originalPriceKopecks: 49500, badge: '+10%', walletGoldAmount: 550, sortOrder: 2 },
    { slug: 'mint-1000-talorien', section: 'mint', productType: 'wallet_topup', title: '1000 Талориенов', description: 'Серебро для внутриигровых покупок', priceKopecks: 19900, walletSilverAmount: 1000, sortOrder: 3 },
    // Hero slots
    { slug: 'hero-slot-1', section: 'heroes', productType: 'account_upgrade', title: 'Дополнительный слот героя', description: '+1 слот для создания героя', priceKopecks: 14900, heroSlotsGrant: 1, sortOrder: 1 },
    { slug: 'hero-slot-3', section: 'heroes', productType: 'account_upgrade', title: '3 слота героев', description: '+3 слота для создания героев', priceKopecks: 34900, originalPriceKopecks: 44700, badge: 'Выгодно', heroSlotsGrant: 3, sortOrder: 2 },
    // Maps
    { slug: 'map-eldoria', section: 'maps', productType: 'one_time', title: 'Руины Элдории', description: 'Новая карта с 3 сценариями', priceKopecks: 29900, entitlementKey: 'map_eldoria', sortOrder: 1 },
    { slug: 'map-dragon-lair', section: 'maps', productType: 'one_time', title: 'Логово Дракона', description: 'Эпическая карта для 1-8 игроков', priceKopecks: 49900, entitlementKey: 'map_dragon_lair', sortOrder: 2 },
  ];

  await CatalogItem.insertMany(items);
  console.log(`✅ Seeded ${items.length} catalog items`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
