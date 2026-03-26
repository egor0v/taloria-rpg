const { z } = require('zod');

const bestiaryQuerySchema = z.object({
  query: z.object({
    tab: z.enum(['monsters', 'spells', 'abilities', 'potions', 'weapons', 'artifacts', 'equipment', 'scrolls', 'tools']),
    search: z.string().max(100).optional(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
    cls: z.enum(['warrior', 'mage', 'priest', 'bard']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  }),
});

const aiNarrateSchema = z.object({
  body: z.object({
    context: z.object({}).passthrough(),
  }),
});

const aiFreeActionSchema = z.object({
  body: z.object({
    heroName: z.string(),
    heroCls: z.string(),
    heroStats: z.object({}).passthrough().optional(),
    actionText: z.string().min(1).max(500),
    scenario: z.string().optional(),
    recentActions: z.array(z.string()).optional(),
    sessionId: z.string().optional(),
  }),
});

const aiDialogSchema = z.object({
  body: z.object({
    npcName: z.string(),
    npcType: z.string().optional(),
    heroName: z.string(),
    heroCls: z.string(),
    playerChoice: z.string(),
    dialogHistory: z.array(z.object({}).passthrough()).optional(),
  }),
});

module.exports = { bestiaryQuerySchema, aiNarrateSchema, aiFreeActionSchema, aiDialogSchema };
