const express = require('express');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { catalogItemSchema, grantResourcesSchema, usersQuerySchema } = require('../schemas/admin.schema');
const CatalogItem = require('../models/CatalogItem');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Hero = require('../models/Hero');
const GameSession = require('../models/GameSession');
const PageView = require('../models/PageView');
const WalletLedger = require('../models/WalletLedger');

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/admin/store-stats
router.get('/store-stats', adminAuth(), async (req, res, next) => {
  try {
    const [totalOrders, revenueResult, activeSubscriptions, totalUsers] = await Promise.all([
      Order.countDocuments({ status: 'paid' }),
      Order.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountKopecks' } } },
      ]),
      Subscription.countDocuments({ status: 'active' }),
      User.countDocuments(),
    ]);

    res.json({
      totalOrders,
      totalRevenueKopecks: revenueResult[0]?.total || 0,
      activeSubscriptions,
      totalUsers,
    });
  } catch (err) { next(err); }
});

// --- CATALOG CRUD ---
router.get('/catalog', adminAuth(), async (req, res, next) => {
  try {
    const items = await CatalogItem.find().sort({ section: 1, sortOrder: 1 }).lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/catalog', adminAuth(), validate(catalogItemSchema), async (req, res, next) => {
  try {
    const item = await CatalogItem.create(req.validated.body);
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Товар с таким slug уже существует' });
    next(err);
  }
});

router.put('/catalog/:id', adminAuth(), validate(catalogItemSchema), async (req, res, next) => {
  try {
    const item = await CatalogItem.findByIdAndUpdate(req.params.id, req.validated.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Товар не найден' });
    res.json(item);
  } catch (err) { next(err); }
});

router.delete('/catalog/:id', adminAuth(), async (req, res, next) => {
  try {
    await CatalogItem.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --- USERS ---
router.get('/users', adminAuth(), validate(usersQuerySchema), async (req, res, next) => {
  try {
    const { page, limit, search } = req.validated.query;
    const filter = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ email: regex }, { displayName: regex }];
    }
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/users/:id', adminAuth(), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/grant
router.post('/users/:id/grant', adminAuth(), validate(grantResourcesSchema), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { gold, silver, heroSlots, reason } = req.validated.body;
    if (gold) user.walletGold += gold;
    if (silver) user.walletSilver += silver;
    if (heroSlots) user.heroSlots += heroSlots;
    await user.save();

    if (gold || silver) {
      await WalletLedger.create({
        userId: user._id,
        type: 'admin_grant',
        goldAmount: gold || 0,
        silverAmount: silver || 0,
        reason: reason || 'Начисление от администратора',
        balanceAfterGold: user.walletGold,
        balanceAfterSilver: user.walletSilver,
      });
    }

    res.json({ ok: true, user: { walletGold: user.walletGold, walletSilver: user.walletSilver, heroSlots: user.heroSlots } });
  } catch (err) { next(err); }
});

// --- HEROES ---
router.get('/heroes', adminAuth(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [heroes, total] = await Promise.all([
      Hero.find().populate('userId', 'displayName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Hero.countDocuments(),
    ]);
    res.json({ heroes, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// --- SESSIONS ---
router.get('/sessions', adminAuth(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      GameSession.find().select('-gameState').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      GameSession.countDocuments(),
    ]);
    res.json({ sessions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.delete('/sessions/:id', adminAuth(), async (req, res, next) => {
  try {
    await GameSession.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --- ORDERS ---
router.get('/store-orders', adminAuth(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find().populate('userId', 'displayName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(),
    ]);
    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// --- METRICS ---
router.get('/metrics', adminAuth(), async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : period === '1d' ? 1 : 7;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [views, uniqueVisitors] = await Promise.all([
      PageView.countDocuments({ createdAt: { $gte: since } }),
      PageView.distinct('visitorId', { createdAt: { $gte: since } }),
    ]);

    const byDay = await PageView.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        views: { $sum: 1 },
        unique: { $addToSet: '$visitorId' },
      }},
      { $project: { date: '$_id', views: 1, unique: { $size: '$unique' } } },
      { $sort: { date: 1 } },
    ]);

    const byPage = await PageView.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$path', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      totalViews: views,
      uniqueVisitors: uniqueVisitors.length,
      byDay,
      byPage,
    });
  } catch (err) { next(err); }
});

module.exports = router;
