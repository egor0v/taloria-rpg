const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema, telegramSchema } = require('../schemas/auth.schema');
const { authLimiter } = require('../middleware/rateLimiter');
const redis = require('../services/redis');
const logger = require('../services/logger');

const router = express.Router();

function generateTokenPair(user) {
  const accessToken = jwt.sign(
    { userId: user._id, email: user.email || '', displayName: user.displayName },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const ttl = config.refreshTokenExpiresDays * 24 * 3600;
  redis.getClient()?.set(`refresh:${refreshToken}`, user._id.toString(), 'EX', ttl);
  return { accessToken, refreshToken };
}

function safeUserJSON(user) {
  return {
    _id: user._id,
    email: user.email,
    telegramId: user.telegramId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    walletGold: user.walletGold,
    walletSilver: user.walletSilver,
    heroSlots: user.heroSlots,
    activeSubscriptionTier: user.activeSubscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    isAdmin: user.isAdmin,
    entitlements: user.entitlements,
    settings: user.settings,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.validated.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      walletSilver: 200, // Бонус при регистрации
    });

    const { accessToken, refreshToken } = generateTokenPair(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiresDays * 24 * 3600 * 1000,
    });

    res.status(201).json({ token: accessToken, user: safeUserJSON(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokenPair(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiresDays * 24 * 3600 * 1000,
    });

    res.json({ token: accessToken, user: safeUserJSON(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/telegram
router.post('/telegram', authLimiter, validate(telegramSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    if (!config.telegramBotToken) {
      return res.status(503).json({ error: 'Telegram auth не настроен' });
    }

    // Verify HMAC-SHA256
    const secretKey = crypto.createHash('sha256').update(config.telegramBotToken).digest();
    const checkString = Object.keys(data)
      .filter(k => k !== 'hash')
      .sort()
      .map(k => `${k}=${data[k]}`)
      .join('\n');
    const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (hmac !== data.hash) {
      return res.status(401).json({ error: 'Невалидная подпись Telegram' });
    }

    // Check auth_date (within 5 min)
    const now = Math.floor(Date.now() / 1000);
    if (now - data.auth_date > 300) {
      return res.status(401).json({ error: 'Данные авторизации устарели' });
    }

    let user = await User.findOne({ telegramId: data.id });
    if (!user) {
      user = await User.create({
        telegramId: data.id,
        displayName: [data.first_name, data.last_name].filter(Boolean).join(' '),
        avatarUrl: data.photo_url || '',
        walletSilver: 200,
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokenPair(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiresDays * 24 * 3600 * 1000,
    });

    res.json({ token: accessToken, user: safeUserJSON(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'Refresh token отсутствует' });

    const client = redis.getClient();
    if (!client) return res.status(401).json({ error: 'Сервис обновления недоступен' });

    const userId = await client.get(`refresh:${token}`);
    if (!userId) return res.status(401).json({ error: 'Невалидный refresh token' });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    // Rotate refresh token
    await client.del(`refresh:${token}`);
    const { accessToken, refreshToken: newRefresh } = generateTokenPair(user);

    res.cookie('refreshToken', newRefresh, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiresDays * 24 * 3600 * 1000,
    });

    res.json({ token: accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', auth(), async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      redis.getClient()?.del(`refresh:${token}`);
    }
    res.clearCookie('refreshToken');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', auth(), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user: safeUserJSON(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
