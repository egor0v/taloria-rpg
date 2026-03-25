'use strict';

/**
 * StatusEffects.js — Серверный модуль статус-эффектов для Taloria RPG
 *
 * Все 22 статус-эффекта (13 негативных + 9 позитивных).
 * Каждый эффект имеет: id, name, negative, maxDuration, stackable,
 * onTick (начало хода), modifiers (постоянные модификаторы).
 */

// ============================================================
// STATUS EFFECT DEFINITIONS
// ============================================================

const STATUS_EFFECTS = {
  // === НЕГАТИВНЫЕ (13) ===

  burning: {
    id: 'burning',
    name: 'Горение',
    negative: true,
    maxDuration: 3,
    stackable: false,
    defaults: { damagePerTurn: 3 },
    onTick(entity, params) {
      const dmg = params.damagePerTurn || this.defaults.damagePerTurn;
      entity.hp = Math.max(0, entity.hp - dmg);
      return { type: 'dot', damage: dmg, label: 'горения' };
    },
  },

  bleeding: {
    id: 'bleeding',
    name: 'Кровотечение',
    negative: true,
    maxDuration: 3,
    stackable: false,
    defaults: { damagePerTurn: 2 },
    onTick(entity, params) {
      const dmg = params.damagePerTurn || this.defaults.damagePerTurn;
      entity.hp = Math.max(0, entity.hp - dmg);
      return { type: 'dot', damage: dmg, label: 'кровотечения' };
    },
  },

  shocked: {
    id: 'shocked',
    name: 'Разряд',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { damagePerTurn: 3 },
    onTick(entity, params) {
      const dmg = params.damagePerTurn || this.defaults.damagePerTurn;
      entity.hp = Math.max(0, entity.hp - dmg);
      return { type: 'dot', damage: dmg, label: 'разряда' };
    },
  },

  frozen: {
    id: 'frozen',
    name: 'Заморозка',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { moveReduction: 1 },
    modifiers: { moveReduction: 1 },
    onTick() { return null; },
  },

  dazed: {
    id: 'dazed',
    name: 'Ошеломление',
    negative: true,
    maxDuration: 2,
    stackable: false,
    // Блокирует использование активных способностей
    modifiers: { blockAbilities: true },
    onTick() { return null; },
  },

  stunned: {
    id: 'stunned',
    name: 'Оглушение',
    negative: true,
    maxDuration: 1,
    stackable: false,
    // Ход пропускается полностью
    modifiers: { skipTurn: true },
    onTick() { return { type: 'skip_turn', label: 'оглушения' }; },
  },

  slowed: {
    id: 'slowed',
    name: 'Замедление',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { moveReduction: 1 },
    modifiers: { moveReduction: 1 },
    onTick() { return null; },
  },

  silenced: {
    id: 'silenced',
    name: 'Безмолвие',
    negative: true,
    maxDuration: 2,
    stackable: false,
    // Нельзя использовать заклинания (spell)
    modifiers: { blockSpells: true },
    onTick() { return null; },
  },

  weakened: {
    id: 'weakened',
    name: 'Слабость',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { attackPenalty: 2 },
    modifiers: { attackPenalty: 2 },
    onTick() { return null; },
  },

  brittle: {
    id: 'brittle',
    name: 'Ломкая защита',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { armorReduction: 2 },
    modifiers: { armorReduction: 2 },
    onTick() { return null; },
  },

  charmed: {
    id: 'charmed',
    name: 'Очарование',
    negative: true,
    maxDuration: 1,
    stackable: false,
    // Ограничение на выбор цели
    modifiers: { restrictTarget: true },
    onTick() { return null; },
  },

  feared: {
    id: 'feared',
    name: 'Страх',
    negative: true,
    maxDuration: 2,
    stackable: false,
    // Принудительное отступление
    modifiers: { forceFlee: true },
    onTick() { return { type: 'forced_flee', label: 'страха' }; },
  },

  rooted: {
    id: 'rooted',
    name: 'Путы',
    negative: true,
    maxDuration: 2,
    stackable: false,
    // Невозможно двигаться
    modifiers: { blockMovement: true },
    onTick() { return null; },
  },

  discord: {
    id: 'discord',
    name: 'Разлад',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { songEfficiency: -0.5 },
    // Сниженная эффективность песен/аур
    modifiers: { songPenalty: 0.5 },
    onTick() { return null; },
  },

  // Совместимость со старыми эффектами
  bleed: {
    id: 'bleed',
    name: 'Кровотечение',
    negative: true,
    maxDuration: 3,
    stackable: false,
    defaults: { damagePerTurn: 2 },
    onTick(entity, params) {
      const dmg = params.damagePerTurn || this.defaults.damagePerTurn;
      entity.hp = Math.max(0, entity.hp - dmg);
      return { type: 'dot', damage: dmg, label: 'кровотечения' };
    },
  },

  stun: {
    id: 'stun',
    name: 'Оглушение',
    negative: true,
    maxDuration: 1,
    stackable: false,
    modifiers: { skipTurn: true },
    onTick() { return { type: 'skip_turn', label: 'оглушения' }; },
  },

  confusion: {
    id: 'confusion',
    name: 'Смятение',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { attackPenalty: 2 },
    modifiers: { attackPenalty: 2 },
    onTick() { return null; },
  },

  sleep: {
    id: 'sleep',
    name: 'Сон',
    negative: true,
    maxDuration: 2,
    stackable: false,
    modifiers: { skipTurn: true },
    onTick() { return { type: 'skip_turn', label: 'сна' }; },
  },

  fear: {
    id: 'fear',
    name: 'Страх',
    negative: true,
    maxDuration: 2,
    stackable: false,
    modifiers: { forceFlee: true },
    onTick() { return { type: 'forced_flee', label: 'страха' }; },
  },

  weaken: {
    id: 'weaken',
    name: 'Слабость',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { attackPenalty: 2, vulnerableToDmg: 0 },
    modifiers: { attackPenalty: 2 },
    onTick() { return null; },
  },

  // === ПОЗИТИВНЫЕ (9) ===

  inspired: {
    id: 'inspired',
    name: 'Воодушевление',
    negative: false,
    maxDuration: 3,
    stackable: false,
    defaults: { dmgBonus: 3 },
    modifiers: { damageBonus: 3 },
    onTick() { return null; },
  },

  guarded: {
    id: 'guarded',
    name: 'Защитная стойка',
    negative: false,
    maxDuration: 2,
    stackable: false,
    defaults: { damageReduction: 2 },
    modifiers: { damageReduction: 2 },
    onTick() { return null; },
  },

  arcane_shield: {
    id: 'arcane_shield',
    name: 'Чародейский покров',
    negative: false,
    maxDuration: 3,
    stackable: false,
    defaults: { shieldHp: 5 },
    onTick() { return null; },
  },

  haste: {
    id: 'haste',
    name: 'Ускорение',
    negative: false,
    maxDuration: 2,
    stackable: false,
    defaults: { moveBonus: 1 },
    modifiers: { moveBonus: 1 },
    onTick() { return null; },
  },

  precision: {
    id: 'precision',
    name: 'Точность',
    negative: false,
    maxDuration: 2,
    stackable: false,
    defaults: { hitBonus: 2 },
    modifiers: { hitBonus: 2 },
    onTick() { return null; },
  },

  regeneration: {
    id: 'regeneration',
    name: 'Регенерация',
    negative: false,
    maxDuration: 3,
    stackable: false,
    defaults: { healPerTurn: 3 },
    onTick(entity, params) {
      const heal = params.healPerTurn || this.defaults.healPerTurn;
      const maxHp = entity.maxHp || entity.hp;
      const actual = Math.min(heal, maxHp - entity.hp);
      if (actual > 0) {
        entity.hp += actual;
      }
      return actual > 0 ? { type: 'heal', amount: actual, label: 'регенерации' } : null;
    },
  },

  clarity: {
    id: 'clarity',
    name: 'Ясность разума',
    negative: false,
    maxDuration: 3,
    stackable: false,
    defaults: { manaCostReduction: 2 },
    modifiers: { manaCostReduction: 2 },
    onTick() { return null; },
  },

  battle_rhythm: {
    id: 'battle_rhythm',
    name: 'Боевой ритм',
    negative: false,
    maxDuration: 3,
    stackable: false,
    defaults: { songBonus: 0.25 },
    modifiers: { songBonus: 0.25 },
    onTick() { return null; },
  },

  counter_stance: {
    id: 'counter_stance',
    name: 'Контратака',
    negative: false,
    maxDuration: 2,
    stackable: false,
    defaults: { counterDamage: 3 },
    modifiers: { counterAttack: true },
    onTick() { return null; },
  },

  // Совместимость: старые позитивные
  resonance: {
    id: 'resonance',
    name: 'Резонанс',
    negative: false,
    maxDuration: 2,
    stackable: false,
    modifiers: { damageBonus: 1 },
    onTick() { return null; },
  },

  heroic_refrain: {
    id: 'heroic_refrain',
    name: 'Героический рефрен',
    negative: false,
    maxDuration: 3,
    stackable: false,
    modifiers: { damageBonus: 2 },
    onTick() { return null; },
  },

  free_step: {
    id: 'free_step',
    name: 'Свободный шаг',
    negative: false,
    maxDuration: 1,
    stackable: false,
    modifiers: { freeStep: true },
    onTick() { return null; },
  },

  // Метки (marks) — специальный подтип
  vanguard_mark: {
    id: 'vanguard_mark',
    name: 'Метка авангарда',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { bonusDmg: 2 },
    modifiers: { vulnerableToDmg: 2 },
    onTick() { return null; },
  },

  vanguard_amplify: {
    id: 'vanguard_amplify',
    name: 'Усиление авангарда',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { bonusDmg: 3 },
    modifiers: { vulnerableToDmg: 3 },
    onTick() { return null; },
  },

  fire_mark: {
    id: 'fire_mark',
    name: 'Метка огня',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { bonusDmg: 2 },
    modifiers: { vulnerableToDmg: 2 },
    onTick() { return null; },
  },

  static_mark: {
    id: 'static_mark',
    name: 'Статическая метка',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { bonusDmg: 2 },
    modifiers: { vulnerableToDmg: 2 },
    onTick() { return null; },
  },

  void_mark: {
    id: 'void_mark',
    name: 'Метка пустоты',
    negative: true,
    maxDuration: 2,
    stackable: false,
    defaults: { bonusDmg: 2 },
    modifiers: { vulnerableToDmg: 2 },
    onTick() { return null; },
  },
};

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Применить статус-эффект к сущности
 * @param {Object} entity — герой или монстр
 * @param {string} statusId — ID эффекта
 * @param {Object} params — переопределения (duration, damagePerTurn, etc.)
 * @returns {{ applied: boolean, replaced: boolean }}
 */
function applyStatus(entity, statusId, params = {}) {
  const def = STATUS_EFFECTS[statusId];
  if (!def) return { applied: false, replaced: false };

  if (!entity.statusEffects) entity.statusEffects = [];

  const duration = params.duration || def.maxDuration;
  const existing = entity.statusEffects.find(e => e.type === statusId);

  if (existing) {
    if (def.stackable) {
      // Stackable: add new instance
      entity.statusEffects.push({
        type: statusId,
        duration,
        ...def.defaults,
        ...params,
      });
      return { applied: true, replaced: false };
    } else {
      // Not stackable: refresh duration if longer
      if (duration > existing.duration) {
        existing.duration = duration;
        Object.assign(existing, params);
      }
      return { applied: true, replaced: true };
    }
  }

  entity.statusEffects.push({
    type: statusId,
    duration,
    ...def.defaults,
    ...params,
  });
  return { applied: true, replaced: false };
}

/**
 * Обработать тик всех статус-эффектов в начале хода
 * @param {Object} entity — герой или монстр
 * @returns {Array<Object>} — массив результатов (урон, лечение, пропуск хода)
 */
function tickStatuses(entity) {
  if (!entity.statusEffects || entity.statusEffects.length === 0) return [];

  const results = [];

  entity.statusEffects = entity.statusEffects.filter(eff => {
    const def = STATUS_EFFECTS[eff.type];
    if (!def) {
      // Unknown effect — just decrement
      eff.duration--;
      return eff.duration > 0;
    }

    // Call onTick
    if (def.onTick) {
      const tickResult = def.onTick(entity, eff);
      if (tickResult) {
        results.push({ ...tickResult, statusId: eff.type, statusName: def.name });
      }
    }

    // Decrement duration
    eff.duration--;
    return eff.duration > 0;
  });

  return results;
}

/**
 * Удалить статус-эффект с сущности
 * @param {Object} entity
 * @param {string} statusId
 * @returns {boolean} — был ли удалён
 */
function removeStatus(entity, statusId) {
  if (!entity.statusEffects) return false;
  const before = entity.statusEffects.length;
  entity.statusEffects = entity.statusEffects.filter(e => e.type !== statusId);
  return entity.statusEffects.length < before;
}

/**
 * Удалить все статус-эффекты
 */
function clearStatuses(entity) {
  entity.statusEffects = [];
}

/**
 * Проверить наличие статус-эффекта
 * @param {Object} entity
 * @param {string} statusId
 * @returns {boolean}
 */
function hasStatus(entity, statusId) {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(e => e.type === statusId);
}

/**
 * Получить конкретный экземпляр статус-эффекта
 */
function getStatus(entity, statusId) {
  if (!entity.statusEffects) return null;
  return entity.statusEffects.find(e => e.type === statusId) || null;
}

/**
 * Получить суммарный модификатор определённого типа от всех эффектов
 * Например: getModifier(hero, 'attackPenalty') → суммарный штраф к атаке
 * @param {Object} entity
 * @param {string} modType — тип модификатора
 * @returns {number}
 */
function getModifier(entity, modType) {
  if (!entity.statusEffects) return 0;
  let total = 0;
  for (const eff of entity.statusEffects) {
    const def = STATUS_EFFECTS[eff.type];
    if (!def || !def.modifiers) continue;
    if (typeof def.modifiers[modType] === 'number') {
      total += def.modifiers[modType];
    } else if (typeof eff[modType] === 'number') {
      // Parameter override
      total += eff[modType];
    }
  }
  return total;
}

/**
 * Проверить булевый модификатор (blockMovement, skipTurn, etc.)
 */
function hasModifier(entity, modType) {
  if (!entity.statusEffects) return false;
  for (const eff of entity.statusEffects) {
    const def = STATUS_EFFECTS[eff.type];
    if (def && def.modifiers && def.modifiers[modType] === true) return true;
  }
  return false;
}

/**
 * Получить снижение перемещения от всех эффектов (frozen, slowed)
 */
function getMoveReduction(entity) {
  return getModifier(entity, 'moveReduction');
}

/**
 * Получить штраф к атаке (confusion, weaken, weakened)
 */
function getAttackPenalty(entity) {
  return getModifier(entity, 'attackPenalty');
}

/**
 * Получить бонус к урону (inspired, resonance, heroic_refrain)
 */
function getDamageBonus(entity) {
  return getModifier(entity, 'damageBonus');
}

/**
 * Получить снижение входящего урона (guarded)
 */
function getDamageReduction(entity) {
  return getModifier(entity, 'damageReduction');
}

/**
 * Получить дополнительную уязвимость к урону (marks, brittle)
 */
function getVulnerability(entity) {
  return getModifier(entity, 'vulnerableToDmg');
}

/**
 * Получить бонус к перемещению (haste)
 */
function getMoveBonus(entity) {
  return getModifier(entity, 'moveBonus');
}

/**
 * Обработать магический щит (arcane_shield) — поглощает урон
 * @returns {number} — оставшийся урон после щита
 */
function absorbShieldDamage(entity, damage) {
  const shield = getStatus(entity, 'arcane_shield');
  if (!shield || !shield.shieldHp) return damage;

  if (shield.shieldHp >= damage) {
    shield.shieldHp -= damage;
    if (shield.shieldHp <= 0) removeStatus(entity, 'arcane_shield');
    return 0;
  } else {
    const remaining = damage - shield.shieldHp;
    removeStatus(entity, 'arcane_shield');
    return remaining;
  }
}

/**
 * Нанести урон с учётом щитов и модификаторов защиты
 * @returns {{ finalDamage: number, shieldAbsorbed: number, reduced: number }}
 */
function applyDamage(entity, rawDamage) {
  let damage = rawDamage;

  // Уязвимость (метки)
  const vuln = getVulnerability(entity);
  if (vuln > 0) damage += vuln;

  // Снижение урона (guarded)
  const reduction = getDamageReduction(entity);
  const reduced = Math.min(damage, reduction);
  damage -= reduced;

  // Магический щит
  const beforeShield = damage;
  damage = absorbShieldDamage(entity, damage);
  const shieldAbsorbed = beforeShield - damage;

  // Применить урон
  if (damage > 0) {
    entity.hp = Math.max(0, entity.hp - damage);
  }

  // Пробуждение от сна при получении урона
  if (rawDamage > 0 && hasStatus(entity, 'sleep')) {
    removeStatus(entity, 'sleep');
  }

  return { finalDamage: damage, shieldAbsorbed, reduced };
}

/**
 * Получить определение эффекта по ID
 */
function getEffectDefinition(statusId) {
  return STATUS_EFFECTS[statusId] || null;
}

/**
 * Получить все активные эффекты сущности с описаниями
 */
function getActiveEffects(entity) {
  if (!entity.statusEffects) return [];
  return entity.statusEffects.map(eff => {
    const def = STATUS_EFFECTS[eff.type];
    return {
      type: eff.type,
      name: def ? def.name : eff.type,
      negative: def ? def.negative : true,
      duration: eff.duration,
      ...eff,
    };
  });
}

module.exports = {
  STATUS_EFFECTS,
  applyStatus,
  tickStatuses,
  removeStatus,
  clearStatuses,
  hasStatus,
  getStatus,
  getModifier,
  hasModifier,
  getMoveReduction,
  getAttackPenalty,
  getDamageBonus,
  getDamageReduction,
  getVulnerability,
  getMoveBonus,
  absorbShieldDamage,
  applyDamage,
  getEffectDefinition,
  getActiveEffects,
};
