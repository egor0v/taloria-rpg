const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Некорректный email').max(255).toLowerCase().trim(),
    password: z.string().min(6, 'Пароль минимум 6 символов').max(128),
    displayName: z.string().min(1, 'Укажите имя игрока').max(50).trim(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(255).toLowerCase().trim(),
    password: z.string().min(1).max(128),
  }),
});

const telegramSchema = z.object({
  body: z.object({
    id: z.number(),
    first_name: z.string(),
    last_name: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.number(),
    hash: z.string(),
  }),
});

module.exports = { registerSchema, loginSchema, telegramSchema };
