/**
 * StatusEffects — All 36 status effects for Taloria RPG
 * Based on game-implementation-guide.md §7
 *
 * 19 negative + 12 positive + 5 marks = 36 total
 */

// ─── EFFECT DEFINITIONS ───

const NEGATIVE_EFFECTS = {
  burning:    { name: 'Горение',         duration: 3, dot: 3, stackable: false },
  bleeding:   { name: 'Кровотечение',    duration: 3, dot: 2, stackable: false },
  bleed:      { name: 'Кровотечение',    duration: 3, dot: 2, stackable: false }, // alias
  shocked:    { name: 'Разряд',          duration: 2, dot: 3, stackable: false },
  frozen:     { name: 'Заморозка',       duration: 2, movePenalty: 1, stackable: false },
  dazed:      { name: 'Ошеломление',     duration: 2, blocksAbilities: true, stackable: false },
  stunned:    { name: 'Оглушение',       duration: 1, skipsTurn: true, stackable: false },
  stun:       { name: 'Оглушение',       duration: 1, skipsTurn: true, stackable: false }, // alias
  slowed:     { name: 'Замедление',      duration: 2, movePenalty: 1, stackable: false },
  silenced:   { name: 'Безмолвие',       duration: 2, blocksSpells: true, stackable: false },
  weakened:   { name: 'Слабость',        duration: 2, attackPenalty: 2, stackable: false },
  weaken:     { name: 'Слабость',        duration: 2, attackPenalty: 2, stackable: false }, // alias
  brittle:    { name: 'Ломкая защита',   duration: 2, armorPenalty: 2, stackable: false },
  charmed:    { name: 'Очарование',      duration: 1, restrictTarget: true, stackable: false },
  feared:     { name: 'Страх',           duration: 2, forcedRetreat: true, stackable: false },
  fear:       { name: 'Страх',           duration: 2, forcedRetreat: true, stackable: false }, // alias
  rooted:     { name: 'Путы',            duration: 2, blocksMovement: true, stackable: false },
  discord:    { name: 'Разлад',          duration: 2, songPenalty: 0.5, stackable: false },
  confusion:  { name: 'Смятение',        duration: 2, attackPenalty: 2, stackable: false },
  sleep:      { name: 'Сон',             duration: 2, skipsTurn: true, removedByDamage: true, stackable: false },
  drowning:   { name: 'Утопление',       duration: 2, dot: 3, stackable: false },
  snare:      { name: 'Капкан',          duration: 1, movePenalty: 2, dot: 5, stackable: false },
  swamp:      { name: 'Трясина',         duration: 2, movePenalty: 1, dot: 3, stackable: false },
};

const POSITIVE_EFFECTS = {
  inspired:       { name: 'Воодушевление',      duration: 3, damageBonus: 3 },
  guarded:        { name: 'Защитная стойка',     duration: 2, damageReduction: 2 },
  arcane_shield:  { name: 'Чародейский покров',  duration: 3, shieldHp: 5 },
  haste:          { name: 'Ускорение',           duration: 2, moveBonus: 1 },
  precision:      { name: 'Точность',            duration: 2, hitBonus: 2 },
  regeneration:   { name: 'Регенерация',         duration: 3, hot: 3 },
  clarity:        { name: 'Ясность разума',      duration: 3, manaCostReduction: 2 },
  battle_rhythm:  { name: 'Боевой ритм',         duration: 3, songBonus: 0.25 },
  counter_stance: { name: 'Контратака',          duration: 2, counterDamage: 3 },
  resonance:      { name: 'Резонанс',            duration: 2, damageBonus: 1 },
  heroic_refrain: { name: 'Героический рефрен',  duration: 3, damageBonus: 2 },
  free_step:      { name: 'Свободный шаг',       duration: 1, freeMovement: true },
  stealth:        { name: 'Скрытность',          duration: 2, hidden: true },
};

const MARKS = {
  vanguard_mark:    { name: 'Метка авангарда',    duration: 2, extraDamageTaken: 2 },
  vanguard_amplify: { name: 'Усиление авангарда', duration: 2, extraDamageTaken: 3, consumeOnHit: true },
  fire_mark:        { name: 'Метка огня',         duration: 2, fireBonus: 2 },
  static_mark:      { name: 'Статическая метка',  duration: 2, staticDischarge: true },
  void_mark:        { name: 'Метка пустоты',      duration: 2, voidDamage: true },
};

const ALL_EFFECTS = { ...NEGATIVE_EFFECTS, ...POSITIVE_EFFECTS, ...MARKS };

// ─── CORE FUNCTIONS ───

/**
 * Apply a status effect to an entity
 */
function applyStatus(entity, effectId, options = {}) {
  if (!entity.statusEffects) entity.statusEffects = [];

  const template = ALL_EFFECTS[effectId];
  if (!template) return false;

  const duration = options.duration || template.duration;
  const existing = entity.statusEffects.find(e => e.type === effectId);

  if (existing && !template.stackable) {
    // Refresh duration if new is longer
    if (duration > existing.turnsRemaining) {
      existing.turnsRemaining = duration;
    }
    return false; // not a new application
  }

  entity.statusEffects.push({
    type: effectId,
    name: template.name,
    turnsRemaining: duration,
    value: options.value || template.shieldHp || 0,
    ...options.extra,
  });

  return true;
}

/**
 * Remove a status effect
 */
function removeStatus(entity, effectId) {
  if (!entity.statusEffects) return;
  entity.statusEffects = entity.statusEffects.filter(e => e.type !== effectId);
}

/**
 * Check if entity has a status effect
 */
function hasStatus(entity, effectId) {
  return entity.statusEffects?.some(e => e.type === effectId) || false;
}

/**
 * Get status effect value
 */
function getStatusValue(entity, effectId) {
  return entity.statusEffects?.find(e => e.type === effectId)?.value || 0;
}

/**
 * Process start-of-turn effects (DOT, HOT, skip turn check)
 * Returns { damage, healing, skipTurn, log[] }
 */
function tickStartOfTurn(entity) {
  const result = { damage: 0, healing: 0, skipTurn: false, log: [] };
  if (!entity.statusEffects?.length) return result;

  for (const effect of entity.statusEffects) {
    const tmpl = ALL_EFFECTS[effect.type];
    if (!tmpl) continue;

    // DOT (damage over time)
    if (tmpl.dot) {
      result.damage += tmpl.dot;
      result.log.push({ type: 'dot', effect: effect.type, name: tmpl.name, damage: tmpl.dot });
    }

    // HOT (heal over time)
    if (tmpl.hot) {
      result.healing += tmpl.hot;
      result.log.push({ type: 'hot', effect: effect.type, name: tmpl.name, healing: tmpl.hot });
    }

    // Skip turn
    if (tmpl.skipsTurn) {
      result.skipTurn = true;
      result.log.push({ type: 'skip', effect: effect.type, name: tmpl.name });
    }
  }

  // Apply damage
  if (result.damage > 0 && entity.hp !== undefined) {
    entity.hp = Math.max(0, entity.hp - result.damage);
    if (entity.hp <= 0) entity.alive = false;
  }

  // Apply healing
  if (result.healing > 0 && entity.hp !== undefined) {
    entity.hp = Math.min(entity.maxHp, entity.hp + result.healing);
  }

  return result;
}

/**
 * Process end-of-turn: decrement durations, remove expired
 * Returns removed effects
 */
function tickEndOfTurn(entity) {
  if (!entity.statusEffects?.length) return [];

  const removed = [];
  entity.statusEffects = entity.statusEffects.filter(effect => {
    effect.turnsRemaining--;
    if (effect.turnsRemaining <= 0) {
      removed.push(effect);
      return false;
    }
    return true;
  });

  return removed;
}

/**
 * Get attack modifier from status effects
 */
function getAttackModifier(entity) {
  let mod = 0;
  if (!entity.statusEffects) return mod;

  for (const effect of entity.statusEffects) {
    const tmpl = ALL_EFFECTS[effect.type];
    if (!tmpl) continue;
    if (tmpl.attackPenalty) mod -= tmpl.attackPenalty;
    if (tmpl.damageBonus) mod += tmpl.damageBonus;
  }

  return mod;
}

/**
 * Get hit modifier (accuracy bonus/penalty)
 */
function getHitModifier(entity) {
  let mod = 0;
  if (!entity.statusEffects) return mod;
  for (const e of entity.statusEffects) {
    const t = ALL_EFFECTS[e.type];
    if (t?.hitBonus) mod += t.hitBonus;
    if (t?.attackPenalty) mod -= t.attackPenalty;
  }
  return mod;
}

/**
 * Get effective armor with status effects
 */
function getEffectiveArmor(entity) {
  let armor = entity.armor || 0;
  if (!entity.statusEffects) return armor;
  for (const e of entity.statusEffects) {
    const t = ALL_EFFECTS[e.type];
    if (t?.armorPenalty) armor -= t.armorPenalty;
  }
  return Math.max(0, armor);
}

/**
 * Get effective move range with status effects
 */
function getEffectiveMoveRange(entity) {
  let range = entity.moveRange || 2;
  if (!entity.statusEffects) return range;
  for (const e of entity.statusEffects) {
    const t = ALL_EFFECTS[e.type];
    if (t?.movePenalty) range -= t.movePenalty;
    if (t?.moveBonus) range += t.moveBonus;
    if (t?.blocksMovement) range = 0;
  }
  return Math.max(0, range);
}

/**
 * Check if entity can use abilities
 */
function canUseAbilities(entity) {
  return !entity.statusEffects?.some(e => ALL_EFFECTS[e.type]?.blocksAbilities);
}

/**
 * Check if entity can cast spells
 */
function canCastSpells(entity) {
  return !entity.statusEffects?.some(e => ALL_EFFECTS[e.type]?.blocksSpells || ALL_EFFECTS[e.type]?.blocksAbilities);
}

/**
 * Apply damage considering status effects (guarded, arcane_shield, sleep removal)
 * Returns actual damage dealt
 */
function applyDamageWithEffects(target, rawDamage) {
  let damage = rawDamage;

  // 1. Vulnerability marks increase damage
  for (const e of (target.statusEffects || [])) {
    const t = ALL_EFFECTS[e.type];
    if (t?.extraDamageTaken) {
      damage += t.extraDamageTaken;
      if (t.consumeOnHit) removeStatus(target, e.type);
    }
  }

  // 2. Guarded reduces damage
  if (hasStatus(target, 'guarded')) {
    damage = Math.max(0, damage - 2);
  }

  // 3. Arcane shield absorbs damage
  if (hasStatus(target, 'arcane_shield')) {
    const shield = target.statusEffects.find(e => e.type === 'arcane_shield');
    if (shield) {
      const absorbed = Math.min(damage, shield.value);
      damage -= absorbed;
      shield.value -= absorbed;
      if (shield.value <= 0) removeStatus(target, 'arcane_shield');
    }
  }

  // 4. Apply remaining damage
  if (damage > 0) {
    target.hp = Math.max(0, (target.hp || 0) - damage);
    if (target.hp <= 0) target.alive = false;
  }

  // 5. Sleep removed by damage
  if (damage > 0 && hasStatus(target, 'sleep')) {
    removeStatus(target, 'sleep');
  }

  return damage;
}

module.exports = {
  ALL_EFFECTS, NEGATIVE_EFFECTS, POSITIVE_EFFECTS, MARKS,
  applyStatus, removeStatus, hasStatus, getStatusValue,
  tickStartOfTurn, tickEndOfTurn,
  getAttackModifier, getHitModifier, getEffectiveArmor, getEffectiveMoveRange,
  canUseAbilities, canCastSpells,
  applyDamageWithEffects,
};
