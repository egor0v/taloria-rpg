const express = require('express');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { aiNarrateSchema, aiFreeActionSchema, aiDialogSchema } = require('../schemas/game.schema');
const { aiLimiter } = require('../middleware/rateLimiter');
const aiMaster = require('../services/aiMaster');

const router = express.Router();

// POST /api/ai/narrate
router.post('/narrate', auth(), aiLimiter, validate(aiNarrateSchema), async (req, res, next) => {
  try {
    const narration = await aiMaster.generateNarration(req.validated.body.context);
    res.json({ narration });
  } catch (err) { next(err); }
});

// POST /api/ai/free-action
router.post('/free-action', auth(), aiLimiter, validate(aiFreeActionSchema), async (req, res, next) => {
  try {
    const result = await aiMaster.generateFreeAction(req.validated.body);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/ai/dialog
router.post('/dialog', auth(), aiLimiter, validate(aiDialogSchema), async (req, res, next) => {
  try {
    const result = await aiMaster.generateDialog(req.validated.body);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/ai/scenario-intro
router.post('/scenario-intro', auth(), aiLimiter, async (req, res, next) => {
  try {
    const narration = await aiMaster.generateScenarioIntro(req.body);
    res.json({ narration });
  } catch (err) { next(err); }
});

// POST /api/ai/combat
router.post('/combat', auth(), aiLimiter, async (req, res, next) => {
  try {
    const narration = await aiMaster.generateCombatNarration(req.body);
    res.json({ narration });
  } catch (err) { next(err); }
});

// POST /api/ai/aggressive
router.post('/aggressive', auth(), aiLimiter, async (req, res, next) => {
  try {
    const result = await aiMaster.generateAggressiveResponse(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
