const { z } = require('zod');

const catalogItemSchema = z.object({
  body: z.object({
    slug: z.string().min(1).max(100),
    section: z.enum(['subscriptions', 'maps', 'addons', 'heroes', 'mint']),
    productType: z.enum(['one_time', 'subscription', 'wallet_topup', 'account_upgrade']),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priceKopecks: z.number().int().min(0),
    originalPriceKopecks: z.number().int().min(0).optional(),
    badge: z.string().max(50).optional(),
    subscriptionTier: z.enum(['stranger', 'seeker', 'legend']).optional(),
    subscriptionPeriodMonths: z.number().int().min(1).optional(),
    walletGoldAmount: z.number().int().min(0).optional(),
    walletSilverAmount: z.number().int().min(0).optional(),
    heroSlotsGrant: z.number().int().min(0).optional(),
    entitlementKey: z.string().optional(),
    limitPerUser: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
});

const grantResourcesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    gold: z.number().int().min(0).optional(),
    silver: z.number().int().min(0).optional(),
    heroSlots: z.number().int().min(0).optional(),
    reason: z.string().max(200).optional(),
  }),
});

const usersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(100).optional(),
  }),
});

module.exports = { catalogItemSchema, grantResourcesSchema, usersQuerySchema };
