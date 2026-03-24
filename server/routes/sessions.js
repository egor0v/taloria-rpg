const express = require('express');
const crypto = require('crypto');
const GameSession = require('../models/GameSession');
const Hero = require('../models/Hero');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createSessionSchema, joinByCodeSchema, joinSessionSchema, updateStatusSchema, historyQuerySchema, statsQuerySchema } = require('../schemas/session.schema');

const router = express.Router();

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// POST /api/sessions
router.post('/', auth(), validate(createSessionSchema), async (req, res, next) => {
  try {
    const { scenarioId, heroId, maxPlayers } = req.validated.body;

    const session = await GameSession.create({
      scenarioId,
      hostUserId: req.user.userId,
      inviteCode: generateInviteCode(),
      maxPlayers: maxPlayers || 4,
      status: 'lobby',
      players: [{
        userId: req.user.userId,
        heroId: heroId || null,
        displayName: req.user.displayName || '',
        connected: true,
        ready: true,
        role: 'host',
      }],
    });

    res.status(201).json({ session });
  } catch (err) { next(err); }
});

// GET /api/sessions/active
router.get('/active', auth(), async (req, res, next) => {
  try {
    const sessions = await GameSession.find({
      'players.userId': req.user.userId,
      status: { $in: ['lobby', 'playing', 'paused'] },
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();
    res.json({ sessions });
  } catch (err) { next(err); }
});

// GET /api/sessions/history
router.get('/history', auth(), validate(historyQuerySchema), async (req, res, next) => {
  try {
    const { heroId, limit } = req.validated.query;
    const filter = {
      'players.userId': req.user.userId,
      status: { $in: ['completed', 'abandoned'] },
    };
    if (heroId) filter['players.heroId'] = heroId;

    const sessions = await GameSession.find(filter)
      .select('scenarioId status players createdAt updatedAt mapId')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    res.json({ sessions });
  } catch (err) { next(err); }
});

// GET /api/sessions/stats
router.get('/stats', auth(), validate(statsQuerySchema), async (req, res, next) => {
  try {
    const { heroId } = req.validated.query;
    const matchFilter = { 'players.userId': req.user.userId };
    if (heroId) matchFilter['players.heroId'] = heroId;

    const [statsResult, byScenario] = await Promise.all([
      GameSession.aggregate([
        { $match: matchFilter },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          abandoned: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
          playing: { $sum: { $cond: [{ $eq: ['$status', 'playing'] }, 1, 0] } },
          lobby: { $sum: { $cond: [{ $eq: ['$status', 'lobby'] }, 1, 0] } },
        }},
      ]),
      GameSession.aggregate([
        { $match: matchFilter },
        { $group: {
          _id: '$scenarioId',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        }},
      ]),
    ]);

    res.json({
      stats: statsResult[0] || { total: 0, completed: 0, abandoned: 0, playing: 0, lobby: 0 },
      byScenario,
    });
  } catch (err) { next(err); }
});

// GET /api/sessions/:id
router.get('/:id', auth(), async (req, res, next) => {
  try {
    const session = await GameSession.findOne({
      _id: req.params.id,
      'players.userId': req.user.userId,
    });
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    res.json({ session });
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/join
router.post('/:id/join', auth(), validate(joinSessionSchema), async (req, res, next) => {
  try {
    const session = await GameSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'lobby') return res.status(400).json({ error: 'Сессия уже начата' });
    if (session.players.length >= session.maxPlayers) return res.status(400).json({ error: 'Сессия заполнена' });
    if (session.players.some(p => p.userId?.toString() === req.user.userId)) {
      return res.status(400).json({ error: 'Вы уже в сессии' });
    }

    session.players.push({
      userId: req.user.userId,
      heroId: req.validated.body.heroId || null,
      displayName: req.user.displayName || '',
      connected: true,
      ready: false,
      role: 'player',
    });
    await session.save();
    res.json({ session });
  } catch (err) { next(err); }
});

// POST /api/sessions/join-by-code
router.post('/join-by-code', auth(), validate(joinByCodeSchema), async (req, res, next) => {
  try {
    const { code, heroId } = req.validated.body;
    const session = await GameSession.findOne({ inviteCode: code.toUpperCase() });
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'lobby') return res.status(400).json({ error: 'Сессия уже начата' });
    if (session.players.length >= session.maxPlayers) return res.status(400).json({ error: 'Сессия заполнена' });
    if (session.players.some(p => p.userId?.toString() === req.user.userId)) {
      return res.status(400).json({ error: 'Вы уже в сессии' });
    }

    session.players.push({
      userId: req.user.userId,
      heroId: heroId || null,
      displayName: req.user.displayName || '',
      connected: true,
      ready: false,
      role: 'player',
    });
    await session.save();
    res.json({ session });
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/ready
router.post('/:id/ready', auth(), async (req, res, next) => {
  try {
    const session = await GameSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

    const player = session.players.find(p => p.userId?.toString() === req.user.userId);
    if (!player) return res.status(403).json({ error: 'Вы не в сессии' });

    player.ready = !player.ready;
    await session.save();
    res.json({ session });
  } catch (err) { next(err); }
});

// GET /api/sessions/:id/heroes
router.get('/:id/heroes', auth(), async (req, res, next) => {
  try {
    const session = await GameSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

    const heroIds = session.players.map(p => p.heroId).filter(Boolean);
    const heroes = await Hero.find({ _id: { $in: heroIds } }).lean();

    const result = session.players.map(p => ({
      playerId: p.userId,
      playerName: p.displayName,
      role: p.role,
      hero: heroes.find(h => h._id.toString() === p.heroId?.toString()) || null,
    }));

    res.json({ heroes: result });
  } catch (err) { next(err); }
});

// PATCH /api/sessions/:id/status
router.patch('/:id/status', auth(), validate(updateStatusSchema), async (req, res, next) => {
  try {
    const session = await GameSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (!session.players.some(p => p.userId?.toString() === req.user.userId)) {
      return res.status(403).json({ error: 'Вы не в сессии' });
    }

    session.status = req.validated.body.status;
    await session.save();
    res.json({ session });
  } catch (err) { next(err); }
});

// DELETE /api/sessions/:id
router.delete('/:id', auth(), async (req, res, next) => {
  try {
    const session = await GameSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

    if (session.hostUserId?.toString() === req.user.userId) {
      await GameSession.findByIdAndDelete(req.params.id);
    } else {
      session.players = session.players.filter(p => p.userId?.toString() !== req.user.userId);
      await session.save();
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
