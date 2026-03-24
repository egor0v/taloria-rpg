const config = require('../config');
const logger = require('./logger');

const FALLBACK_NARRATIONS = {
  scenarioIntro: 'Путешествие начинается. Впереди ждут испытания и приключения...',
  combat: 'Звон стали разрезает тишину. Бой продолжается...',
  freeAction: 'Вы пытаетесь выполнить задуманное...',
  dialog: 'НПС внимательно вас выслушивает...',
  narration: 'Окружающий мир наполнен загадками и опасностями...',
  aggressive: 'Существо реагирует на ваши действия...',
};

async function callOpenRouter(messages, options = {}) {
  if (!config.openrouterApiKey) {
    logger.warn('OpenRouter API key not configured, using fallback');
    return null;
  }

  const { maxTokens = 500, temperature = 0.85 } = options;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://taloria.ru',
          'X-Title': 'Taloria RPG',
        },
        body: JSON.stringify({
          model: config.aiModel,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (err) {
      logger.error('OpenRouter API error', { attempt, error: err.message });
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  return null;
}

const SYSTEM_PROMPT = `Ты — AI-ведущий фэнтезийной RPG "Taloria". Ты создаёшь атмосферные описания в стиле тёмного фэнтези.
Правила:
- Пиши на русском языке
- Используй кинематографичный стиль описания
- Будь лаконичен (2-5 предложений)
- Не нарушай игровую механику
- Не упоминай что ты AI`;

async function generateNarration(context) {
  const result = await callOpenRouter([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Опиши происходящее: ${JSON.stringify(context)}` },
  ]);
  return result || FALLBACK_NARRATIONS.narration;
}

async function generateFreeAction(data) {
  const result = await callOpenRouter([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Герой ${data.heroName} (${data.heroCls}) совершает свободное действие: "${data.actionText}". Сценарий: ${data.scenario || 'неизвестен'}. Предыдущие действия: ${(data.recentActions || []).join(', ')}. Опиши результат (2-5 предложений) и верни JSON { narration, success: true/false, mechanicResult?: object }` },
  ]);

  try {
    const parsed = JSON.parse(result);
    return parsed;
  } catch {
    return { narration: result || FALLBACK_NARRATIONS.freeAction, success: true };
  }
}

async function generateDialog(data) {
  const result = await callOpenRouter([
    { role: 'system', content: `${SYSTEM_PROMPT}\nТы озвучиваешь NPC "${data.npcName}" (${data.npcType || 'обычный NPC'}). Отвечай от его лица. Верни JSON { npcText: string, choices: [{ text: string }] } с 2-4 вариантами ответов.` },
    ...(data.dialogHistory || []),
    { role: 'user', content: `${data.heroName} (${data.heroCls}) говорит: "${data.playerChoice}"` },
  ], { maxTokens: 400 });

  try {
    const parsed = JSON.parse(result);
    return parsed;
  } catch {
    return {
      npcText: result || FALLBACK_NARRATIONS.dialog,
      choices: [{ text: 'Продолжить разговор' }, { text: 'Уйти' }],
    };
  }
}

async function generateScenarioIntro(data) {
  const result = await callOpenRouter([
    { role: 'system', content: `${SYSTEM_PROMPT}\nТы начинаешь новое приключение. Создай атмосферное вступление (4-6 предложений).` },
    { role: 'user', content: `Сценарий: "${data.scenarioName}". Описание: ${data.scenarioDesc || ''}. Герои: ${(data.heroes || []).map(h => `${h.name} (${h.cls})`).join(', ')}` },
  ], { maxTokens: 500, temperature: 0.85 });
  return result || FALLBACK_NARRATIONS.scenarioIntro;
}

async function generateCombatNarration(data) {
  const result = await callOpenRouter([
    { role: 'system', content: `${SYSTEM_PROMPT}\nОписывай боевое действие (1-3 предложения, кинематографичный стиль).` },
    { role: 'user', content: `${data.attacker} атакует ${data.defender}. Действие: ${data.action}. Результат: ${data.result}. Критический удар: ${data.isCritical ? 'да' : 'нет'}. Урон: ${data.damage || 0}.` },
  ], { maxTokens: 200, temperature: 0.8 });
  return result || FALLBACK_NARRATIONS.combat;
}

async function generateAggressiveResponse(data) {
  const result = await callOpenRouter([
    { role: 'system', content: `${SYSTEM_PROMPT}\nМонстр "${data.monster}" реагирует на действие героя. Верни JSON { narration: string, mechanicResult?: { damage?: number, statusEffect?: string } }` },
    { role: 'user', content: `Герой ${data.hero} совершает: "${data.action}". Контекст: ${JSON.stringify(data.context || {})}` },
  ], { maxTokens: 300 });

  try {
    return JSON.parse(result);
  } catch {
    return { narration: result || FALLBACK_NARRATIONS.aggressive };
  }
}

module.exports = {
  generateNarration,
  generateFreeAction,
  generateDialog,
  generateScenarioIntro,
  generateCombatNarration,
  generateAggressiveResponse,
};
