const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const CatalogItem = require('../models/CatalogItem');
const Order = require('../models/Order');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const WalletLedger = require('../models/WalletLedger');
const { auth, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { checkoutSchema, ordersQuerySchema } = require('../schemas/store.schema');
const { storeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// GET /api/store/catalog
router.get('/catalog', optionalAuth(), async (req, res, next) => {
  try {
    const { section } = req.query;
    const filter = { active: true };
    if (section) filter.section = section;

    const items = await CatalogItem.find(filter).sort({ section: 1, sortOrder: 1 }).lean();

    let userEntitlements = [];
    let userOrders = [];
    if (req.user) {
      const user = await User.findById(req.user.userId).select('entitlements').lean();
      userEntitlements = user?.entitlements || [];
      userOrders = await Order.find({ userId: req.user.userId, status: 'paid' }).select('catalogItemId').lean();
    }
    const paidItemIds = new Set(userOrders.map(o => o.catalogItemId?.toString()));

    const annotated = items.map(item => ({
      ...item,
      owned: item.entitlementKey ? userEntitlements.includes(item.entitlementKey) : false,
      canPurchase: item.limitPerUser > 0
        ? paidItemIds.has(item._id.toString()) ? false : true
        : true,
    }));

    // Group by section
    const sections = {};
    for (const item of annotated) {
      if (!sections[item.section]) sections[item.section] = [];
      sections[item.section].push(item);
    }

    res.set('Cache-Control', 'public, max-age=60');
    res.json({ sections, items: annotated });
  } catch (err) { next(err); }
});

// GET /api/store/catalog/:slug
router.get('/catalog/:slug', optionalAuth(), async (req, res, next) => {
  try {
    const item = await CatalogItem.findOne({ slug: req.params.slug, active: true }).lean();
    if (!item) return res.status(404).json({ error: 'Товар не найден' });

    let owned = false;
    if (req.user && item.entitlementKey) {
      const user = await User.findById(req.user.userId).select('entitlements').lean();
      owned = user?.entitlements?.includes(item.entitlementKey) || false;
    }

    res.json({ ...item, owned });
  } catch (err) { next(err); }
});

// POST /api/store/checkout
router.post('/checkout', auth(), storeLimiter, validate(checkoutSchema), async (req, res, next) => {
  try {
    const { catalogItemSlug } = req.validated.body;
    const item = await CatalogItem.findOne({ slug: catalogItemSlug, active: true });
    if (!item) return res.status(404).json({ error: 'Товар не найден' });

    // Check limits
    if (item.limitPerUser > 0) {
      const count = await Order.countDocuments({
        userId: req.user.userId,
        catalogItemId: item._id,
        status: 'paid',
      });
      if (count >= item.limitPerUser) {
        return res.status(400).json({ error: 'Лимит покупок достигнут' });
      }
    }

    // Check entitlement
    if (item.entitlementKey) {
      const user = await User.findById(req.user.userId).select('entitlements');
      if (user?.entitlements?.includes(item.entitlementKey)) {
        return res.status(400).json({ error: 'Вы уже владеете этим товаром' });
      }
    }

    const tbankOrderId = `TAL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const order = await Order.create({
      userId: req.user.userId,
      catalogItemId: item._id,
      status: 'pending',
      amountKopecks: item.priceKopecks,
      tbankOrderId,
      productSnapshot: {
        slug: item.slug,
        title: item.title,
        section: item.section,
        productType: item.productType,
        priceKopecks: item.priceKopecks,
        subscriptionTier: item.subscriptionTier,
        subscriptionPeriodMonths: item.subscriptionPeriodMonths,
        walletGoldAmount: item.walletGoldAmount,
        walletSilverAmount: item.walletSilverAmount,
        heroSlotsGrant: item.heroSlotsGrant,
        entitlementKey: item.entitlementKey,
      },
    });

    // Dev mode: auto-fulfill without payment
    if (!config.tbankTerminalKey) {
      order.status = 'paid';
      order.paidAt = new Date();
      await order.save();
      await fulfillOrder(order);
      return res.json({ orderId: order._id, paymentUrl: null, devMode: true });
    }

    // T-Bank payment init
    const paymentData = {
      TerminalKey: config.tbankTerminalKey,
      Amount: item.priceKopecks,
      OrderId: tbankOrderId,
      Description: item.title,
      NotificationURL: `${req.protocol}://${req.get('host')}/api/payments/tbank/webhook`,
      SuccessURL: `${req.protocol}://${req.get('host')}/api/payments/tbank/success?orderId=${order._id}`,
      FailURL: `${req.protocol}://${req.get('host')}/api/payments/tbank/fail?orderId=${order._id}`,
    };

    // Sign with HMAC
    const tokenData = { ...paymentData, Password: config.tbankSecretKey };
    const tokenStr = Object.keys(tokenData).sort().map(k => tokenData[k]).join('');
    paymentData.Token = crypto.createHash('sha256').update(tokenStr).digest('hex');

    const resp = await fetch(`${config.tbankApiUrl}/Init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData),
    });
    const result = await resp.json();

    if (!result.Success) {
      order.status = 'failed';
      await order.save();
      return res.status(400).json({ error: result.Message || 'Ошибка платежа' });
    }

    order.tbankPaymentId = result.PaymentId;
    await order.save();

    res.json({ orderId: order._id, paymentUrl: result.PaymentURL });
  } catch (err) { next(err); }
});

// Fulfill order logic
async function fulfillOrder(order) {
  const user = await User.findById(order.userId);
  if (!user) return;

  const snapshot = order.productSnapshot;
  switch (snapshot.productType) {
    case 'subscription': {
      const now = new Date();
      const months = snapshot.subscriptionPeriodMonths || 1;
      const expiresAt = new Date(now.getTime() + months * 30 * 24 * 3600 * 1000);

      await Subscription.create({
        userId: user._id,
        tier: snapshot.subscriptionTier,
        status: 'active',
        startsAt: now,
        expiresAt,
        orderId: order._id,
      });

      user.activeSubscriptionTier = snapshot.subscriptionTier;
      user.subscriptionExpiresAt = expiresAt;
      break;
    }
    case 'wallet_topup': {
      if (snapshot.walletGoldAmount) user.walletGold += snapshot.walletGoldAmount;
      if (snapshot.walletSilverAmount) user.walletSilver += snapshot.walletSilverAmount;

      await WalletLedger.create({
        userId: user._id,
        type: 'topup',
        goldAmount: snapshot.walletGoldAmount || 0,
        silverAmount: snapshot.walletSilverAmount || 0,
        reason: `Покупка: ${snapshot.title}`,
        orderId: order._id,
        balanceAfterGold: user.walletGold,
        balanceAfterSilver: user.walletSilver,
      });
      break;
    }
    case 'account_upgrade': {
      if (snapshot.heroSlotsGrant) user.heroSlots += snapshot.heroSlotsGrant;
      break;
    }
    case 'one_time': {
      if (snapshot.entitlementKey && !user.entitlements.includes(snapshot.entitlementKey)) {
        user.entitlements.push(snapshot.entitlementKey);
      }
      break;
    }
  }

  await user.save();
}

// GET /api/store/orders
router.get('/orders', auth(), validate(ordersQuerySchema), async (req, res, next) => {
  try {
    const { page, limit } = req.validated.query;
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find({ userId: req.user.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments({ userId: req.user.userId }),
    ]);
    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/store/orders/:id
router.get('/orders/:id', auth(), async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.userId }).lean();
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    res.json(order);
  } catch (err) { next(err); }
});

// GET /api/store/entitlements
router.get('/entitlements', auth(), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('entitlements activeSubscriptionTier subscriptionExpiresAt walletGold walletSilver heroSlots').lean();
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    res.json({
      entitlements: user.entitlements,
      subscription: { tier: user.activeSubscriptionTier, expiresAt: user.subscriptionExpiresAt },
      wallet: { gold: user.walletGold, silver: user.walletSilver },
      heroSlots: user.heroSlots,
    });
  } catch (err) { next(err); }
});

// GET /api/store/subscription
router.get('/subscription', auth(), async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user.userId, status: 'active' }).sort({ expiresAt: -1 }).lean();
    if (!sub) return res.json({ active: false });
    res.json({
      active: true,
      tier: sub.tier,
      startDate: sub.startsAt,
      endDate: sub.expiresAt,
      status: sub.status,
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.fulfillOrder = fulfillOrder;
