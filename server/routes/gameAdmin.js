const express = require('express');
const multer = require('multer');
const path = require('path');
const { adminAuth } = require('../middleware/auth');
const GameMap = require('../models/GameMap');
const Scenario = require('../models/Scenario');
const MonsterTemplate = require('../models/MonsterTemplate');
const GameItem = require('../models/GameItem');
const AbilityTemplate = require('../models/AbilityTemplate');
const config = require('../config');

const router = express.Router();

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: config.maxFileSize } });

// Generic CRUD factory
function createCRUD(Model, uniqueField) {
  const crud = express.Router();

  crud.get('/', adminAuth(), async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;
      const search = req.query.search || '';

      const filter = {};
      if (search) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { name: regex },
          ...(Model.schema.paths.mapId ? [{ mapId: regex }] : []),
          ...(Model.schema.paths.type ? [{ type: regex }] : []),
          ...(Model.schema.paths.itemId ? [{ itemId: regex }] : []),
          ...(Model.schema.paths.abilityId ? [{ abilityId: regex }] : []),
          ...(Model.schema.paths.scenarioId ? [{ scenarioId: regex }] : []),
          ...(Model.schema.paths.slug ? [{ slug: regex }] : []),
        ];
      }
      // Extra filters for items
      if (req.query.type && Model.schema.paths.type) filter.type = req.query.type;
      if (req.query.rarity && Model.schema.paths.rarity) filter.rarity = req.query.rarity;
      if (req.query.shopLocation && Model.schema.paths.shopLocation) filter.shopLocation = req.query.shopLocation;
      if (req.query.cls && Model.schema.paths.cls) filter.cls = req.query.cls;
      if (req.query.isCraftable && Model.schema.paths.isCraftable) {
        if (req.query.isCraftable === 'true') filter.isCraftable = true;
        else filter.$and = [...(filter.$and || []), { $or: [{ isCraftable: false }, { isCraftable: { $exists: false } }] }];
      }

      const [items, total] = await Promise.all([
        Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ data: items, items, total, page, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
  });

  crud.get('/:id', adminAuth(), async (req, res, next) => {
    try {
      const item = await Model.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ error: 'Не найдено' });
      res.json(item);
    } catch (err) { next(err); }
  });

  crud.post('/', adminAuth(), async (req, res, next) => {
    try {
      const item = await Model.create(req.body);
      res.status(201).json(item);
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: `Дублирующийся ${uniqueField}` });
      next(err);
    }
  });

  crud.put('/:id', adminAuth(), async (req, res, next) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ error: 'Не найдено' });
      res.json(item);
    } catch (err) { next(err); }
  });

  crud.delete('/:id', adminAuth(), async (req, res, next) => {
    try {
      await Model.findByIdAndUpdate(req.params.id, { active: false });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return crud;
}

router.use('/maps', createCRUD(GameMap, 'mapId'));
router.use('/scenarios', createCRUD(Scenario, 'scenarioId'));
router.use('/monsters', createCRUD(MonsterTemplate, 'type'));
router.use('/items', createCRUD(GameItem, 'itemId'));
router.use('/abilities', createCRUD(AbilityTemplate, 'abilityId'));

// File upload endpoint
router.post('/upload', adminAuth(), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

module.exports = router;
