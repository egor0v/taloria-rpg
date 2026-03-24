const { z } = require('zod');

const createSessionSchema = z.object({
  body: z.object({
    scenarioId: z.string().min(1),
    heroId: z.string().optional(),
    maxPlayers: z.number().int().min(1).max(8).optional(),
  }),
});

const joinByCodeSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(20),
    heroId: z.string().optional(),
  }),
});

const joinSessionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    heroId: z.string().optional(),
  }),
});

const updateStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.enum(['lobby', 'playing', 'paused', 'completed', 'abandoned']),
  }),
});

const historyQuerySchema = z.object({
  query: z.object({
    heroId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

const statsQuerySchema = z.object({
  query: z.object({
    heroId: z.string().optional(),
  }),
});

module.exports = {
  createSessionSchema,
  joinByCodeSchema,
  joinSessionSchema,
  updateStatusSchema,
  historyQuerySchema,
  statsQuerySchema,
};
