const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const Order = require('../models/Order');
const { fulfillOrder } = require('./store');
const logger = require('../services/logger');

const router = express.Router();

// POST /api/payments/tbank/webhook
router.post('/tbank/webhook', express.text({ type: '*/*' }), async (req, res, next) => {
  try {
    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).send('Bad JSON');
    }

    // Verify token
    if (config.tbankSecretKey) {
      const { Token, ...rest } = data;
      const tokenData = { ...rest, Password: config.tbankSecretKey };
      const tokenStr = Object.keys(tokenData).sort().map(k => tokenData[k]).join('');
      const expectedToken = crypto.createHash('sha256').update(tokenStr).digest('hex');
      if (Token !== expectedToken) {
        logger.warn('T-Bank webhook: invalid token');
        return res.status(401).send('Invalid token');
      }
    }

    const order = await Order.findOne({ tbankOrderId: data.OrderId });
    if (!order) {
      logger.warn('T-Bank webhook: order not found', { orderId: data.OrderId });
      return res.send('OK');
    }

    // Idempotency
    if (order.status === 'paid') {
      return res.send('OK');
    }

    const status = data.Status;
    if (status === 'CONFIRMED' || status === 'AUTHORIZED') {
      order.status = 'paid';
      order.paidAt = new Date();
      order.tbankPaymentId = data.PaymentId;
      await order.save();

      try {
        await fulfillOrder(order);
      } catch (err) {
        logger.error('fulfillOrder error', { orderId: order._id, error: err.message });
      }
    } else if (['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REFUNDED'].includes(status)) {
      order.status = 'failed';
      await order.save();
    }

    res.send('OK');
  } catch (err) {
    logger.error('T-Bank webhook error', { error: err.message });
    res.status(500).send('Error');
  }
});

// GET /api/payments/tbank/success
router.get('/tbank/success', (req, res) => {
  res.redirect(`/lavka?order=${req.query.orderId || ''}&status=success`);
});

// GET /api/payments/tbank/fail
router.get('/tbank/fail', (req, res) => {
  res.redirect(`/lavka?order=${req.query.orderId || ''}&status=fail`);
});

module.exports = router;
