const express = require('express');
const User = require('../models/User');
const WalletLedger = require('../models/WalletLedger');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/wallet
router.get('/', auth(), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('walletGold walletSilver').lean();
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ gold: user.walletGold, silver: user.walletSilver });
  } catch (err) { next(err); }
});

// GET /api/wallet/ledger
router.get('/ledger', auth(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      WalletLedger.find({ userId: req.user.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WalletLedger.countDocuments({ userId: req.user.userId }),
    ]);

    res.json({ entries, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// ═══ ОБМЕН ТАЛОРИЕНОВ → ЗОЛОТО (Главная Лавка) ═══
// Курс: 100 Талориенов = 1 Золото
const Hero = require('../models/Hero');
const TALORIENS_PER_GOLD = 100;

router.post('/exchange', auth(), async (req, res, next) => {
  try {
    const { heroId, amount } = req.body;
    if (!heroId || !amount) return res.status(400).json({ error: 'Укажите heroId и amount (кол-во золота)' });

    const goldToGet = parseInt(amount);
    if (isNaN(goldToGet) || goldToGet < 1) return res.status(400).json({ error: 'Минимум 1 золото' });

    const taloriensNeeded = goldToGet * TALORIENS_PER_GOLD;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if ((user.walletSilver || 0) < taloriensNeeded) {
      return res.status(400).json({ error: `Недостаточно Талориенов. Нужно: ${taloriensNeeded}, у вас: ${user.walletSilver || 0}` });
    }

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    // Списать Талориены
    user.walletSilver = (user.walletSilver || 0) - taloriensNeeded;
    await user.save();

    // Начислить золото герою
    hero.gold = (hero.gold || 0) + goldToGet;
    await hero.save();

    await WalletLedger.create({
      userId: req.user.userId, type: 'purchase',
      goldAmount: goldToGet, silverAmount: -taloriensNeeded,
      reason: `Обмен ${taloriensNeeded} Талориенов → ${goldToGet} золота для ${hero.name}`,
      balanceAfterGold: user.walletGold, balanceAfterSilver: user.walletSilver,
    });

    res.json({
      success: true, taloriensSpent: taloriensNeeded, goldReceived: goldToGet,
      heroName: hero.name, heroGold: hero.gold, heroSilver: hero.silver,
      walletBalance: user.walletSilver,
    });
  } catch (err) { next(err); }
});

// ═══ ОБМЕН ЗОЛОТА → СЕРЕБРО (Инвентарь персонажа) ═══
// Курс: 1 Золото = 100 Серебра
const SILVER_PER_GOLD = 100;

router.post('/gold-to-silver', auth(), async (req, res, next) => {
  try {
    const { heroId, amount } = req.body;
    if (!heroId || !amount) return res.status(400).json({ error: 'Укажите heroId и amount (кол-во золота)' });

    const goldToConvert = parseInt(amount);
    if (isNaN(goldToConvert) || goldToConvert < 1) return res.status(400).json({ error: 'Минимум 1 золото' });

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });
    if ((hero.gold || 0) < goldToConvert) {
      return res.status(400).json({ error: `Недостаточно золота. У ${hero.name}: ${hero.gold || 0}, нужно: ${goldToConvert}` });
    }

    const silverReceived = goldToConvert * SILVER_PER_GOLD;

    hero.gold = (hero.gold || 0) - goldToConvert;
    hero.silver = (hero.silver || 0) + silverReceived;
    await hero.save();

    res.json({
      success: true, goldSpent: goldToConvert, silverReceived,
      heroName: hero.name, heroGold: hero.gold, heroSilver: hero.silver,
    });
  } catch (err) { next(err); }
});

// GET /api/wallet/exchange-rates
router.get('/exchange-rates', (req, res) => {
  res.json({
    taloriensPerGold: TALORIENS_PER_GOLD,
    silverPerGold: SILVER_PER_GOLD,
    description: '100 Талориенов = 1 Золото, 1 Золото = 100 Серебра',
  });
});

module.exports = router;
