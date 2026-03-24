const { z } = require('zod');

const createHeroSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(24).trim(),
    cls: z.enum(['warrior', 'mage', 'priest', 'bard']),
    race: z.enum(['human', 'elf', 'dwarf']).default('human'),
    gender: z.enum(['male', 'female']).default('male'),
    statBonuses: z.record(
      z.enum(['attack', 'agility', 'armor', 'intellect', 'wisdom', 'charisma']),
      z.number().int().min(0).max(6)
    ).optional(),
    appearance: z.object({
      hairColor: z.string().optional(),
      skinColor: z.string().optional(),
      hairstyle: z.string().optional(),
      feature: z.string().optional(),
    }).optional(),
  }),
});

const updateHeroSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({
    id: z.string().min(1),
  }),
});

const levelUpSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const spendSkillPointsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    attack: z.number().int().min(0).optional(),
    agility: z.number().int().min(0).optional(),
    armor: z.number().int().min(0).optional(),
    intellect: z.number().int().min(0).optional(),
    wisdom: z.number().int().min(0).optional(),
    charisma: z.number().int().min(0).optional(),
  }),
});

const unlockAbilitySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    abilityId: z.string(),
    replaceAbilityId: z.string().optional(),
  }),
});

const tradeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  }),
});

module.exports = {
  createHeroSchema,
  updateHeroSchema,
  levelUpSchema,
  spendSkillPointsSchema,
  unlockAbilitySchema,
  tradeSchema,
};
