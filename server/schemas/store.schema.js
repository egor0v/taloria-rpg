const { z } = require('zod');

const checkoutSchema = z.object({
  body: z.object({
    catalogItemSlug: z.string().min(1),
  }),
});

const ordersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

module.exports = { checkoutSchema, ordersQuerySchema };
