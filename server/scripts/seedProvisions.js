require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
mongoose.connect(require('../config').mongodbUri).then(async () => {
  const GameItem = require('../models/GameItem');
  const provisions = [
    { itemId: 'bread-loaf', name: 'Ржаной хлеб', type: 'provisions', slot: 'none', rarity: 'common', description: 'Грубый ржаной хлеб — простая еда для путников.', usable: true, stackable: true, maxStack: 10, weight: 0.3, effect: { heal: 5 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'meat-stew', name: 'Мясная похлёбка', type: 'provisions', slot: 'none', rarity: 'common', description: 'Горячая наваристая похлёбка с кусками мяса.', usable: true, stackable: true, maxStack: 5, weight: 0.5, effect: { heal: 12 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'roasted-chicken', name: 'Жареная курица', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Золотистая курица на вертеле. Поднимает настроение.', usable: true, stackable: true, maxStack: 3, weight: 0.8, effect: { heal: 20 }, shopLocation: 'tavern-2', active: true },
    { itemId: 'cheese-wheel', name: 'Головка сыра', type: 'provisions', slot: 'none', rarity: 'common', description: 'Выдержанный овечий сыр. Питательный и долго хранится.', usable: true, stackable: true, maxStack: 5, weight: 0.4, effect: { heal: 8 }, shopLocation: 'tavern-3', active: true },
    { itemId: 'apple-pie', name: 'Яблочный пирог', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Ароматный пирог с корицей. Восстанавливает HP и ману.', usable: true, stackable: true, maxStack: 3, weight: 0.4, effect: { heal: 10, mana: 5 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'dried-meat', name: 'Вяленое мясо', type: 'provisions', slot: 'none', rarity: 'common', description: 'Солёное вяленое мясо. Хорошо утоляет голод.', usable: true, stackable: true, maxStack: 10, weight: 0.2, effect: { heal: 6 }, shopLocation: 'tavern-2', active: true },
    { itemId: 'fish-grilled', name: 'Жареная рыба', type: 'provisions', slot: 'none', rarity: 'common', description: 'Свежая речная рыба на углях.', usable: true, stackable: true, maxStack: 5, weight: 0.5, effect: { heal: 8 }, shopLocation: 'tavern-3', active: true },
    { itemId: 'mushroom-soup', name: 'Грибной суп', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Густой суп из лесных грибов. Лечит, но может вызвать головокружение.', usable: true, stackable: true, maxStack: 3, weight: 0.5, effect: { heal: 15, status: 'confusion', statusDuration: 1 }, shopLocation: 'tavern-4', active: true },
    { itemId: 'honey-cake', name: 'Медовый пряник', type: 'provisions', slot: 'none', rarity: 'rare', description: 'Медовый пряник по эльфийскому рецепту. Отлично восстанавливает.', usable: true, stackable: true, maxStack: 3, weight: 0.2, effect: { heal: 25 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'suspicious-mushroom', name: 'Подозрительный гриб', type: 'provisions', slot: 'none', rarity: 'common', description: 'Странный гриб. Немного лечит, но может отравить.', usable: true, stackable: true, maxStack: 5, weight: 0.1, effect: { heal: 3, status: 'burning', statusDuration: 2 }, shopLocation: 'tavern-4', active: true },
    { itemId: 'ale-mug', name: 'Кружка эля', type: 'provisions', slot: 'none', rarity: 'common', description: 'Пенный эль. Придаёт храбрости, но снижает точность.', usable: true, stackable: true, maxStack: 5, weight: 0.5, effect: { heal: 5, status: 'weakened', statusDuration: 1 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'wine-bottle', name: 'Бутылка вина', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Красное вино. Лечит, но замедляет реакцию.', usable: true, stackable: true, maxStack: 3, weight: 0.6, effect: { heal: 10, status: 'slowed', statusDuration: 1 }, shopLocation: 'tavern-2', active: true },
    { itemId: 'herbal-tea', name: 'Травяной чай', type: 'provisions', slot: 'none', rarity: 'common', description: 'Ароматный чай. Мягко восстанавливает HP и ману.', usable: true, stackable: true, maxStack: 5, weight: 0.3, effect: { heal: 8, mana: 5 }, shopLocation: 'tavern-3', active: true },
    { itemId: 'mead-flask', name: 'Фляга мёда', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Густой медовый напиток. Согревает и восстанавливает.', usable: true, stackable: true, maxStack: 3, weight: 0.4, effect: { heal: 15 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'dwarven-stout', name: 'Дварфийский стаут', type: 'provisions', slot: 'none', rarity: 'rare', description: 'Крепчайший тёмный эль гномов. Мощно лечит, но притупляет рефлексы.', usable: true, stackable: true, maxStack: 2, weight: 0.6, effect: { heal: 25, status: 'slowed', statusDuration: 2 }, shopLocation: 'tavern-4', active: true },
    { itemId: 'elven-nectar', name: 'Эльфийский нектар', type: 'provisions', slot: 'none', rarity: 'rare', description: 'Изысканный напиток эльфов. Восстанавливает тело и дух.', usable: true, stackable: true, maxStack: 2, weight: 0.3, effect: { heal: 20, mana: 15 }, shopLocation: 'tavern-3', active: true },
    { itemId: 'warm-milk', name: 'Тёплое молоко', type: 'provisions', slot: 'none', rarity: 'common', description: 'Свежее коровье молоко. Простой полезный напиток.', usable: true, stackable: true, maxStack: 5, weight: 0.3, effect: { heal: 4 }, shopLocation: 'tavern-2', active: true },
    { itemId: 'firewater', name: 'Огненная вода', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Обжигающий напиток орков. Поднимает дух, но кружит голову.', usable: true, stackable: true, maxStack: 3, weight: 0.4, effect: { heal: 8, status: 'confusion', statusDuration: 2 }, shopLocation: 'tavern-4', active: true },
    { itemId: 'berry-juice', name: 'Ягодный морс', type: 'provisions', slot: 'none', rarity: 'common', description: 'Освежающий морс из лесных ягод.', usable: true, stackable: true, maxStack: 5, weight: 0.3, effect: { heal: 6, mana: 3 }, shopLocation: 'tavern-1', active: true },
    { itemId: 'goblin-grog', name: 'Гоблинский грог', type: 'provisions', slot: 'none', rarity: 'uncommon', description: 'Мерзкое пойло гоблинов. Хорошо лечит, но может отравить.', usable: true, stackable: true, maxStack: 3, weight: 0.5, effect: { heal: 18, status: 'burning', statusDuration: 1 }, shopLocation: 'tavern-4', active: true },
  ];
  let created = 0, skipped = 0;
  for (const item of provisions) {
    const exists = await GameItem.findOne({ $or: [{ itemId: item.itemId }, { name: item.name }] });
    if (exists) { skipped++; continue; }
    await GameItem.create(item);
    created++;
  }
  console.log('Created:', created, '| Skipped:', skipped);
  const count = await GameItem.countDocuments({ type: 'provisions', active: true });
  console.log('Total provisions in DB:', count);
  const byShop = await GameItem.aggregate([{ $match: { type: 'provisions', active: true } }, { $group: { _id: '$shopLocation', count: { $sum: 1 } } }]);
  console.log('By tavern:');
  byShop.forEach(s => console.log('  ' + s._id + ': ' + s.count));
  await mongoose.disconnect();
});
