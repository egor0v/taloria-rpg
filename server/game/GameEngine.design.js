'use strict';

const {
  applyStatus, tickStatuses, removeStatus, clearStatuses,
  hasStatus, getStatus, getModifier, hasModifier,
  getMoveReduction, getAttackPenalty, getDamageBonus,
  getDamageReduction, getVulnerability, getMoveBonus,
  absorbShieldDamage, applyDamage, getActiveEffects,
} = require('./StatusEffects');

// ============================================================
// CONSTANTS (ported from app.js)
// ============================================================

const BASE_MOVE_RANGE = 2;
const OFFROAD_MOVE_RANGE = 1;
const OFFROAD_COST = 1;
const SURPRISE_INITIATIVE_BONUS = 10;
const SURPRISE_DAMAGE_BONUS = 5;
const SURPRISE_CRIT_BONUS = 0.20;
const COMBAT_ZONE_RANGE = 4;
const ENCOUNTER_RANGE = 3;

// Monster abilities lookup (subset for server-side AI)
const MONSTER_ABILITIES = {
  aggressiveAttack: { bonusDamage: 2 },
  bleedingBite: { bleedChance: 0.3, bleedDamage: 2, bleedDuration: 2 },
  dodge: { dodgeChance: 0.25 },
  shieldBlock: { damageReduction: 4, cooldown: 2 },
  quickStrike: { critThreshold: 17 },
};

// ============================================================
// GAME ENGINE CLASS
// ============================================================

class GameEngine {
  /**
   * @param {Object} gameState — полное состояние игры (in-memory)
   * @param {string} sessionId
   * @param {Array} [players] — список игроков сессии для назначения _ownerId
   */
  constructor(gameState, sessionId, players) {
    this.gs = gameState;
    this.sessionId = sessionId;
    this.players = players || [];
    this.actionLog = []; // Лог для рассылки клиентам
    this.events = [];    // Результирующие события

    // Статистика матча
    if (!this.gs.matchStats) {
      this.gs.matchStats = {};
    }

    // Назначить _ownerId героям из списка игроков сессии
    this._assignOwnership();
  }

  /**
   * Назначает _ownerId героям на основе данных сессии
   */
  _assignOwnership() {
    if (!this.players.length || !this.gs.heroes) return;
    this.gs.heroes.forEach(h => {
      if (h._ownerId) return; // Уже назначено
      // Найти игрока по heroId
      const player = this.players.find(p => {
        if (!p.heroId) return false;
        const heroIdStr = p.heroId.toString();
        return heroIdStr === h.id || heroIdStr === h._serverId;
      });
      if (player) {
        h._ownerId = player.userId.toString();
      }
    });
  }

  // ============================================================
  // DICE
  // ============================================================

  rollDice(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // ============================================================
  // ENTITY LOOKUP
  // ============================================================

  findEntity(entityId) {
    const hero = this.gs.heroes.find(h => h.id === entityId);
    if (hero) return { ...hero, entityType: 'hero' };
    const mon = this.gs.monsters.find(m => m.id === entityId);
    if (mon) return { ...mon, entityType: 'monster' };
    return null;
  }

  findHero(heroId) {
    return this.gs.heroes.find(h => h.id === heroId) || null;
  }

  findMonster(monsterId) {
    return this.gs.monsters.find(m => m.id === monsterId) || null;
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  /**
   * Полная валидация действия (10-point checklist)
   */
  validateAction(userId, action) {
    const currentTurn = this.gs.turnOrder[this.gs.currentTurnIdx];
    if (!currentTurn) return { ok: false, error: 'Нет активного хода' };

    // 1. Принадлежит ли юнит игроку?
    if (currentTurn.type !== 'hero') return { ok: false, error: 'Сейчас ход монстра' };
    const hero = this.findHero(action.heroId || currentTurn.entityId);
    if (!hero) return { ok: false, error: 'Герой не найден' };
    // Strict ownership check — no wildcard access in multiplayer
    if (hero._ownerId && hero._ownerId !== userId) return { ok: false, error: 'Не ваш герой' };
    // If _ownerId is missing, try to assign from session players
    if (!hero._ownerId && this.players.length > 0) {
      this._assignOwnership();
      if (hero._ownerId && hero._ownerId !== userId) return { ok: false, error: 'Не ваш герой' };
    }

    // 2. Активен ли юнит (его ход)?
    if (hero.id !== currentTurn.entityId) return { ok: false, error: 'Сейчас не ход этого героя' };

    // 3. Жив ли юнит?
    if (hero.dead || hero.hp <= 0) return { ok: false, error: 'Герой мёртв' };

    // 4. Не запрещено ли действие статусом?
    if (hasStatus(hero, 'stunned') || hasStatus(hero, 'stun')) {
      return { ok: false, error: 'Герой оглушён — ход пропущен' };
    }
    if (hasStatus(hero, 'sleep')) {
      return { ok: false, error: 'Герой спит — ход пропущен' };
    }

    switch (action.type) {
      case 'move':
        return this.validateMove(hero, action);
      case 'attack':
        return this.validateAttack(hero, action);
      case 'ability':
        return this.validateAbility(hero, action);
      case 'end-turn':
        return { ok: true };
      default:
        return { ok: false, error: `Неизвестный тип действия: ${action.type}` };
    }
  }

  validateMove(hero, action) {
    // Ход уже использован?
    if (this.gs.moveUsed) return { ok: false, error: 'Перемещение уже использовано' };

    // Путы (rooted) блокируют движение
    if (hasStatus(hero, 'rooted')) return { ok: false, error: 'Путы — невозможно двигаться' };

    // Проверка целевой клетки
    const { targetRow, targetCol } = action;
    if (targetRow === undefined || targetCol === undefined) {
      return { ok: false, error: 'Не указана целевая клетка' };
    }

    // Проверка границ карты
    if (!this.isValidCell(targetRow, targetCol)) {
      return { ok: false, error: 'Клетка за пределами карты' };
    }

    // Проверка стены
    if (this.gs.map[targetRow][targetCol] === 'wall') {
      return { ok: false, error: 'Нельзя двигаться в стену' };
    }

    // Проверка занятости
    if (this.isCellOccupied(targetRow, targetCol, hero.id)) {
      return { ok: false, error: 'Клетка занята' };
    }

    // Проверка достижимости (BFS)
    const moveRange = this.getEffectiveMoveRange(hero);
    const reachable = this.getReachableCells(hero.row, hero.col, moveRange, hero.id);
    const canReach = reachable.some(c => c.row === targetRow && c.col === targetCol);
    if (!canReach) {
      return { ok: false, error: 'Клетка недостижима' };
    }

    return { ok: true };
  }

  validateAttack(hero, action) {
    // Действие уже использовано?
    if (this.gs.actionUsed) return { ok: false, error: 'Действие уже использовано' };

    // Найти цель
    const target = this.gs.monsters.find(m => m.id === action.targetId) ||
                   this.gs.heroes.find(h => h.id === action.targetId);
    if (!target) return { ok: false, error: 'Цель не найдена' };
    if (target.dead || target.hp <= 0) return { ok: false, error: 'Цель мертва' };

    // Проверка дальности
    const dist = Math.abs(hero.row - target.row) + Math.abs(hero.col - target.col);
    const attackRange = hero.attackRange || 1;
    if (dist > attackRange) return { ok: false, error: 'Цель вне радиуса атаки' };

    // Line of sight
    if (!this.hasLineOfSight(hero.row, hero.col, target.row, target.col)) {
      return { ok: false, error: 'Цель не в зоне видимости' };
    }

    return { ok: true };
  }

  validateAbility(hero, action) {
    // Действие (основное или бонусное) уже использовано?
    if (this.gs.actionUsed && this.gs.bonusActionUsed) {
      return { ok: false, error: 'Все действия использованы' };
    }

    // Ошеломлён — нет способностей
    if (hasStatus(hero, 'dazed') || hasStatus(hero, 'confusion')) {
      return { ok: false, error: 'Ошеломлён — нельзя использовать способности' };
    }

    // Получить механику способности
    const mech = this.getAbilityMechanics(action.abilityId);
    if (!mech) return { ok: false, error: 'Способность не найдена' };
    if (mech.passive) return { ok: false, error: 'Пассивная способность' };

    // Безмолвие блокирует заклинания
    if (hasStatus(hero, 'silenced') && mech.type === 'spell') {
      return { ok: false, error: 'Безмолвие — нельзя использовать заклинания' };
    }

    // Хватает маны?
    let manaCost = mech.manaCost || 0;
    // Ясность разума снижает стоимость
    const clarityReduction = getModifier(hero, 'manaCostReduction');
    if (clarityReduction > 0) manaCost = Math.max(1, manaCost - clarityReduction);
    if ((hero.mp || 0) < manaCost) return { ok: false, error: 'Недостаточно маны' };

    // Кулдаун
    if (hero.cooldowns && hero.cooldowns[action.abilityId] > 0) {
      return { ok: false, error: 'Способность в перезарядке' };
    }

    // Проверка цели
    if (action.targetId) {
      const target = this.gs.monsters.find(m => m.id === action.targetId) ||
                     this.gs.heroes.find(h => h.id === action.targetId);
      if (!target) return { ok: false, error: 'Цель не найдена' };
      if ((target.dead || target.hp <= 0) && mech.targetType === 'enemy') {
        return { ok: false, error: 'Цель мертва' };
      }

      // Charmed — ограничение цели
      if (hasStatus(hero, 'charmed') && mech.targetType === 'enemy') {
        // Charmed: нельзя атаковать ближайшего союзника (упрощённая версия)
      }

      // Проверка дальности
      const dist = Math.abs(hero.row - target.row) + Math.abs(hero.col - target.col);
      let range = mech.range || 1;
      if (range === 0) range = hero.attackRange || 1; // weapon range
      if (dist > range) return { ok: false, error: 'Цель вне радиуса' };

      // Line of sight
      if (!this.hasLineOfSight(hero.row, hero.col, target.row, target.col)) {
        return { ok: false, error: 'Цель не в зоне видимости' };
      }
    } else if (action.targetRow !== undefined && action.targetCol !== undefined) {
      // AoE targeting — check range to cell
      const dist = Math.abs(hero.row - action.targetRow) + Math.abs(hero.col - action.targetCol);
      let range = mech.range || 5;
      if (dist > range) return { ok: false, error: 'Точка вне радиуса' };
    }

    return { ok: true };
  }

  // ============================================================
  // ACTION PROCESSING (entry point)
  // ============================================================

  /**
   * Main entry point — validates and executes action
   * @returns {{ error?: string, result?: Object }}
   */
  processAction(userId, action) {
    const validation = this.validateAction(userId, action);
    if (!validation.ok) return { error: validation.error };

    let result;
    switch (action.type) {
      case 'move':
        result = this.executeMove(action);
        break;
      case 'attack':
        result = this.executeAttack(action);
        break;
      case 'ability':
        result = this.executeAbility(action);
        break;
      case 'end-turn':
        result = this.executeEndTurn();
        break;
      default:
        return { error: 'Неизвестный тип действия' };
    }

    return { result };
  }

  // ============================================================
  // EXECUTE: MOVE
  // ============================================================

  executeMove(action) {
    const hero = this.findHero(action.heroId);
    const fromRow = hero.row;
    const fromCol = hero.col;

    // Calculate path for animation
    const path = this.findPath(hero.row, hero.col, action.targetRow, action.targetCol, hero.id);

    // Move hero
    hero.row = action.targetRow;
    hero.col = action.targetCol;
    this.gs.moveUsed = true;

    // Log
    this.addLog(`${hero.name} перемещается`, 'log-action');

    // Check for traps, encounters, etc. (simplified)
    const events = [];

    // In explore mode, check for monster aggro
    if (this.gs.mode === 'explore') {
      const aggroMonsters = this.checkAggroAfterMove(hero);
      if (aggroMonsters.length > 0) {
        events.push({ type: 'encounter', monsters: aggroMonsters.map(m => m.id) });
      }
    }

    return {
      type: 'move',
      heroId: hero.id,
      fromRow, fromCol,
      toRow: hero.row,
      toCol: hero.col,
      path,
      events,
    };
  }

  // ============================================================
  // EXECUTE: ATTACK
  // ============================================================

  executeAttack(action) {
    const hero = this.findHero(action.heroId);
    const target = this.gs.monsters.find(m => m.id === action.targetId) ||
                   this.gs.heroes.find(h => h.id === action.targetId);

    // Check dodge
    const dodged = this.checkDodge(target);
    if (dodged) {
      this.gs.actionUsed = true;
      this.addLog(`${target.name} уклоняется от атаки ${hero.name}!`, 'log-action');
      return {
        type: 'attack',
        heroId: hero.id,
        targetId: target.id,
        dodged: true,
      };
    }

    // Armor penetration: d20
    const armorRoll = this.rollDice(20);
    const armorValue = this.getEntityArmor(target);
    const confPenalty = getAttackPenalty(hero);
    const effectiveRoll = Math.max(1, armorRoll - confPenalty);
    const precisionBonus = getModifier(hero, 'hitBonus');

    const critThreshold = hero.surpriseAttack
      ? Math.max(1, 20 - Math.floor(20 * SURPRISE_CRIT_BONUS))
      : 20;
    const isCrit = effectiveRoll >= critThreshold;
    const isFail = effectiveRoll === 1;

    // Shield block check
    let shieldBlocked = false;
    if (target.shieldBlockActive) {
      const reduction = MONSTER_ABILITIES.shieldBlock.damageReduction;
      if (!isCrit && effectiveRoll <= armorValue + reduction) {
        shieldBlocked = true;
      }
      target.shieldBlockActive = false;
    }

    const penetrated = isCrit || (!isFail && !shieldBlocked && (effectiveRoll + precisionBonus) > armorValue);

    if (!penetrated) {
      this.gs.actionUsed = true;
      if (hero.surpriseAttack) {
        hero.surpriseAttack = false;
        hero.stealth = 0;
      }
      this.addLog(`${hero.name} атакует ${target.name} — броня выдержала! (🎲${armorRoll} vs ${armorValue})`, 'log-action');
      return {
        type: 'attack',
        heroId: hero.id,
        targetId: target.id,
        armorRoll,
        armorValue,
        penetrated: false,
        isCrit: false,
        shieldBlocked,
      };
    }

    // Damage roll
    const damageDie = this.getHeroDamageDie(hero);
    const dmgRoll = this.rollDice(damageDie);
    const surpriseBonus = hero.surpriseAttack ? SURPRISE_DAMAGE_BONUS : 0;
    let attackBonus = (hero.attack || 0) + surpriseBonus;

    // Inspired buff
    const inspiredBonus = getDamageBonus(hero);
    attackBonus += inspiredBonus;

    // Consume inspired (one-time)
    if (inspiredBonus > 0) {
      removeStatus(hero, 'inspired');
    }

    // Vulnerability on target
    const vulnBonus = getVulnerability(target);
    attackBonus += vulnBonus;

    const baseDmg = dmgRoll + attackBonus;
    const finalDmg = isCrit ? baseDmg * 2 : baseDmg;

    // Apply damage with shields/reduction
    const dmgResult = applyDamage(target, finalDmg);

    // Clear surprise
    if (hero.surpriseAttack) {
      hero.surpriseAttack = false;
      hero.stealth = 0;
    }

    // Process marks on target
    this.processMarksOnDamage(hero, target, 'attack', null);

    // Break sleep
    if (finalDmg > 0 && hasStatus(target, 'sleep')) {
      removeStatus(target, 'sleep');
    }

    this.gs.actionUsed = true;

    // Track stats
    this.trackDamage(hero.id, finalDmg);
    this.trackDamageTaken(target.id, finalDmg);

    // Check death
    let killed = false;
    if (target.hp <= 0) {
      killed = true;
      this.killEntity(target);
      this.trackKill(hero.id, target.id);
    }

    this.addLog(`${hero.name} наносит ${finalDmg} урона ${target.name}${isCrit ? ' (КРИТ!)' : ''}`, 'log-damage');

    return {
      type: 'attack',
      heroId: hero.id,
      targetId: target.id,
      armorRoll,
      armorValue,
      penetrated: true,
      isCrit,
      dmgRoll,
      damageDie,
      attackBonus,
      baseDmg,
      finalDmg,
      shieldAbsorbed: dmgResult.shieldAbsorbed,
      reduced: dmgResult.reduced,
      targetHp: target.hp,
      killed,
    };
  }

  // ============================================================
  // EXECUTE: ABILITY
  // ============================================================

  executeAbility(action) {
    const hero = this.findHero(action.heroId);
    const mech = this.getAbilityMechanics(action.abilityId);
    if (!mech) return { type: 'ability', error: 'Механика не найдена' };

    // Deduct mana
    let manaCost = mech.manaCost || 0;
    const clarityReduction = getModifier(hero, 'manaCostReduction');
    if (clarityReduction > 0) manaCost = Math.max(1, manaCost - clarityReduction);
    hero.mp = Math.max(0, (hero.mp || 0) - manaCost);

    // Set cooldown if applicable
    if (mech.cooldown) {
      if (!hero.cooldowns) hero.cooldowns = {};
      hero.cooldowns[action.abilityId] = mech.cooldown;
    }

    // No damage roll abilities (heal, buff, etc.)
    if (mech.noDamageRoll) {
      const result = this.executeNoDamageAbility(hero, action, mech);
      if (!this.gs.actionUsed) {
        this.gs.actionUsed = true;
      } else {
        this.gs.bonusActionUsed = true;
      }
      return result;
    }

    // Find target
    let target = null;
    if (action.targetId) {
      target = this.gs.monsters.find(m => m.id === action.targetId) ||
               this.gs.heroes.find(h => h.id === action.targetId);
    }

    // Skip armor phase for some abilities
    let penetrated = true;
    let armorRoll = 0;
    let armorValue = 0;
    let isCrit = false;

    if (!mech.skipArmorPhase && target) {
      armorRoll = this.rollDice(20);
      armorValue = this.getEntityArmor(target);

      // Armor pen bonus from ability/branch
      let armorPenBonus = 0;
      if (mech.branchBonus && mech.branchBonus.armorPen) {
        armorPenBonus += mech.branchBonus.armorPen;
      }

      const critThreshold = hero.surpriseAttack
        ? Math.max(1, 20 - Math.floor(20 * SURPRISE_CRIT_BONUS))
        : 20;
      isCrit = armorRoll >= critThreshold;
      const isFail = armorRoll === 1;

      const effectiveRoll = armorRoll + armorPenBonus + getModifier(hero, 'hitBonus');
      penetrated = isCrit || (!isFail && effectiveRoll > armorValue);
    }

    if (!penetrated) {
      if (!this.gs.actionUsed) {
        this.gs.actionUsed = true;
      } else {
        this.gs.bonusActionUsed = true;
      }
      this.addLog(`${hero.name} использует способность — броня выдержала!`, 'log-action');
      return {
        type: 'ability',
        heroId: hero.id,
        abilityId: action.abilityId,
        targetId: target?.id,
        penetrated: false,
        armorRoll,
        armorValue,
        manaCost,
      };
    }

    // Damage roll
    let finalDmg = 0;
    let dmgRoll = 0;
    const damageDie = mech.damageDie || 6;

    if (target && mech.damageDie) {
      dmgRoll = this.rollDice(damageDie);
      const surpriseBonus = hero.surpriseAttack ? SURPRISE_DAMAGE_BONUS : 0;
      let bonusStat = 0;
      if (mech.bonusStat === 'intellect') {
        bonusStat = hero.intellect || hero.attack || 0;
      } else {
        bonusStat = hero.attack || 0;
      }
      const spellDmgBonus = getModifier(hero, 'spellDamageBonus') || 0;
      const inspiredBonus = getDamageBonus(hero);

      const baseDmg = dmgRoll + bonusStat + surpriseBonus + spellDmgBonus + inspiredBonus;
      finalDmg = isCrit ? baseDmg * 2 : baseDmg;

      // Consume inspired
      if (inspiredBonus > 0) removeStatus(hero, 'inspired');

      // Apply damage
      applyDamage(target, finalDmg);

      // Process marks
      this.processMarksOnDamage(hero, target, 'ability', action.abilityId);

      // Track stats
      this.trackDamage(hero.id, finalDmg);
      this.trackDamageTaken(target.id, finalDmg);
    }

    // AoE damage
    let aoeDamage = [];
    if (mech.aoe && mech.aoe.die && action.targetRow !== undefined) {
      aoeDamage = this.processAoE(hero, action, mech);
    }

    // Status effect application
    let statusApplied = null;
    if (mech.statusEffect && target && target.hp > 0) {
      const chance = mech.statusEffect.chance || 1;
      if (Math.random() < chance) {
        const effData = mech.statusEffect.effect;
        applyStatus(target, effData.type, effData);
        statusApplied = { type: effData.type, name: mech.statusEffect.name, targetId: target.id };
        this.trackStatusApplied(hero.id);
      }
    }

    // Clear surprise
    if (hero.surpriseAttack) {
      hero.surpriseAttack = false;
      hero.stealth = 0;
    }

    if (!this.gs.actionUsed) {
      this.gs.actionUsed = true;
    } else {
      this.gs.bonusActionUsed = true;
    }

    // Check death
    let killed = false;
    if (target && target.hp <= 0) {
      killed = true;
      this.killEntity(target);
      this.trackKill(hero.id, target.id);
    }

    this.addLog(`${hero.name} использует способность → ${finalDmg} урона`, 'log-action');

    return {
      type: 'ability',
      heroId: hero.id,
      abilityId: action.abilityId,
      targetId: target?.id,
      penetrated: true,
      isCrit,
      armorRoll,
      armorValue,
      dmgRoll,
      damageDie,
      finalDmg,
      manaCost,
      statusApplied,
      aoeDamage,
      killed,
      targetHp: target?.hp,
    };
  }

  executeNoDamageAbility(hero, action, mech) {
    const results = { type: 'ability', heroId: hero.id, abilityId: action.abilityId, noDamage: true };
    const specific = mech.specific;

    // Heal allies
    if (specific && specific.healAllies) {
      const healAmount = (mech.damageDie ? this.rollDice(mech.damageDie) : 3) + (hero.intellect || 0);
      const allyHeroes = this.gs.heroes.filter(h => h.hp > 0 && !h.dead && h.id !== hero.id);
      const nearby = allyHeroes.filter(h =>
        Math.abs(h.row - hero.row) + Math.abs(h.col - hero.col) <= (mech.range || 3));
      nearby.forEach(h => {
        h.hp = Math.min(h.maxHp || h.hp, h.hp + healAmount);
      });
      results.heal = { amount: healAmount, targets: nearby.map(h => h.id) };
      this.addLog(`${hero.name} исцеляет союзников на ${healAmount} HP`, 'log-heal');
    }

    // Shield/buff
    if (specific && specific.shield) {
      applyStatus(hero, 'guarded', { damageReduction: specific.shield.amount || 2, duration: 2 });
      results.shield = { heroId: hero.id, amount: specific.shield.amount || 2 };
    }

    // Inspire
    if (specific && specific.inspire) {
      const allyHeroes = this.gs.heroes.filter(h => h.hp > 0 && !h.dead && h.id !== hero.id);
      const nearby = allyHeroes.filter(h =>
        Math.abs(h.row - hero.row) + Math.abs(h.col - hero.col) <= (mech.range || 3));
      nearby.forEach(h => {
        applyStatus(h, 'inspired', { dmgBonus: specific.inspire.dmgBonus || 3, duration: 2 });
      });
      results.inspired = nearby.map(h => h.id);
    }

    return results;
  }

  processAoE(hero, action, mech) {
    const results = [];
    const centerR = action.targetRow;
    const centerC = action.targetCol;
    const radius = mech.aoe.radius || 1;
    const aoeDie = mech.aoe.die || 4;

    const targets = this.gs.monsters.filter(m =>
      m.hp > 0 && !m.fled &&
      Math.abs(m.row - centerR) + Math.abs(m.col - centerC) <= radius
    );

    for (const target of targets) {
      const aoeDmg = this.rollDice(aoeDie) + (hero.intellect || 0);
      applyDamage(target, aoeDmg);
      results.push({ targetId: target.id, damage: aoeDmg, hp: target.hp });
      this.trackDamage(hero.id, aoeDmg);
      if (target.hp <= 0) {
        this.killEntity(target);
        this.trackKill(hero.id, target.id);
      }
    }

    return results;
  }

  // ============================================================
  // EXECUTE: END TURN
  // ============================================================

  executeEndTurn() {
    // Process zone effects
    this.processZoneEffects();

    // Decrement cooldowns
    const currentTurn = this.gs.turnOrder[this.gs.currentTurnIdx];
    if (currentTurn && currentTurn.type === 'hero') {
      const hero = this.findHero(currentTurn.entityId);
      if (hero && hero.cooldowns) {
        for (const key of Object.keys(hero.cooldowns)) {
          if (hero.cooldowns[key] > 0) hero.cooldowns[key]--;
        }
      }
    }

    // Advance turn
    return this.advanceTurn();
  }

  advanceTurn() {
    this.gs.currentTurnIdx++;
    if (this.gs.currentTurnIdx >= this.gs.turnOrder.length) {
      this.gs.currentTurnIdx = 0;
      this.gs.round++;
    }

    // Check combat end
    if (this.gs.mode === 'combat') {
      const combatEndResult = this.checkCombatEnd();
      if (combatEndResult) return combatEndResult;
    }

    // Start next turn
    return this.startNextTurn();
  }

  startNextTurn() {
    const turn = this.gs.turnOrder[this.gs.currentTurnIdx];
    if (!turn) return { type: 'combat_ended', result: 'error' };

    // Reset action flags
    this.gs.moveUsed = false;
    this.gs.actionUsed = false;
    this.gs.bonusActionUsed = false;

    if (turn.type === 'monster') {
      // Tick monster statuses
      const mon = this.findMonster(turn.entityId);
      if (mon && mon.hp > 0) {
        const tickResults = tickStatuses(mon);

        // Check if monster died from DOT
        if (mon.hp <= 0) {
          this.killEntity(mon);
          return this.advanceTurn(); // Skip dead monster's turn
        }

        // Check stun/sleep — skip turn
        if (hasStatus(mon, 'stun') || hasStatus(mon, 'stunned') || hasStatus(mon, 'sleep')) {
          this.addLog(`${mon.name} пропускает ход!`, 'log-action');
          return this.advanceTurn();
        }

        // Monster AI — server executes
        const monsterResult = this.runMonsterTurn(mon);
        return {
          type: 'monster_action',
          entityId: turn.entityId,
          monsterResult,
          nextTurn: this.advanceTurn(),
        };
      } else {
        return this.advanceTurn(); // Dead monster — skip
      }
    }

    // Hero turn
    const hero = this.findHero(turn.entityId);
    if (!hero || hero.dead || hero.hp <= 0) {
      return this.advanceTurn(); // Dead hero — skip
    }

    // Skip disconnected player's hero
    if (hero._ownerId && this.players.length > 0) {
      const ownerPlayer = this.players.find(p => p.userId?.toString() === hero._ownerId);
      if (ownerPlayer && ownerPlayer.connected === false) {
        this.addLog(`${hero.name} пропускает ход (игрок отключён)`, 'log-action');
        return this.advanceTurn();
      }
    }

    // Tick hero statuses
    const tickResults = tickStatuses(hero);

    // Check if hero died from DOT
    if (hero.hp <= 0) {
      this.killEntity(hero);
      return this.advanceTurn();
    }

    // Check stun/sleep — auto skip
    if (hasStatus(hero, 'stun') || hasStatus(hero, 'stunned') || hasStatus(hero, 'sleep')) {
      this.addLog(`${hero.name} пропускает ход!`, 'log-action');
      return this.advanceTurn();
    }

    // Calculate reachable cells for the hero
    const moveRange = this.getEffectiveMoveRange(hero);
    this.gs.reachableCells = this.getReachableCells(hero.row, hero.col, moveRange, hero.id);
    this.gs.movePointsLeft = moveRange;

    return {
      type: 'turn_started',
      entityId: turn.entityId,
      entityType: 'hero',
      ownerId: hero._ownerId,
      tickResults,
      reachableCells: this.gs.reachableCells,
      moveRange,
    };
  }

  // ============================================================
  // MONSTER AI
  // ============================================================

  runMonsterTurn(mon) {
    if (!mon || mon.hp <= 0) return { skipped: true };

    // Check aggro
    if (!mon.aggro) {
      this.addLog(`${mon.name} бездействует`, 'log-enemy');
      return { skipped: true, reason: 'no_aggro' };
    }

    // Fear — flee
    if (hasStatus(mon, 'fear') || hasStatus(mon, 'feared')) {
      this.addLog(`${mon.name} в панике!`, 'log-enemy');
      const result = this.monsterFlee(mon);
      return { type: 'flee', ...result };
    }

    // Silenced — log but continue
    if (hasStatus(mon, 'silenced')) {
      this.addLog(`${mon.name} под безмолвием`, 'log-action');
    }

    // Tick shield block cooldown
    if (mon.shieldBlockCooldown > 0) mon.shieldBlockCooldown--;

    const aliveHeroes = this.gs.heroes.filter(h => h.hp > 0 && !h.dead && !h.leftGame);
    if (aliveHeroes.length === 0) return { skipped: true, reason: 'no_targets' };

    // Select target
    const target = this.selectTarget(mon, aliveHeroes);
    if (!target) return { skipped: true, reason: 'no_target' };

    const dist = Math.abs(target.row - mon.row) + Math.abs(target.col - mon.col);
    const atkRange = mon.attackRange || 1;
    let movRange = this.getEffectiveMoveRange(mon);

    const result = { type: 'monster_turn', monsterId: mon.id, actions: [] };

    // Scout AI: flee at low HP
    if (mon.aiType === 'scout' && mon.hp < mon.maxHp * 0.3) {
      const fleeResult = this.monsterFlee(mon);
      if (fleeResult.moved) {
        result.actions.push({ type: 'flee', ...fleeResult });
        return result;
      }
    }

    // Archer AI: shoot then retreat
    if (mon.aiType === 'archer' && dist <= atkRange) {
      const atkResult = this.performMonsterAttack(mon, target);
      result.actions.push({ type: 'attack', ...atkResult });
      // Retreat
      if (mon.abilities && mon.abilities.includes('retreat')) {
        this.monsterRetreat(mon, target, 1);
        result.actions.push({ type: 'retreat', row: mon.row, col: mon.col });
      }
      return result;
    }

    // Flanker AI: leap
    if (mon.aiType === 'flanker' && dist > 1) {
      if (mon.abilities && mon.abilities.includes('leap') && dist <= movRange + 2) {
        const path = this.findPath(mon.row, mon.col, target.row, target.col, mon.id);
        if (path.length > 2) {
          const leapIdx = Math.min(movRange + 2, path.length - 2);
          const leapStep = path[leapIdx];
          if (leapStep && !this.isCellOccupied(leapStep.row, leapStep.col, mon.id)) {
            mon.row = leapStep.row;
            mon.col = leapStep.col;
            result.actions.push({ type: 'leap', row: mon.row, col: mon.col });
          }
        }
      }
    }

    // General: in range → attack; otherwise move then attack
    const currentDist = Math.abs(target.row - mon.row) + Math.abs(target.col - mon.col);
    if (currentDist <= atkRange) {
      const atkResult = this.performMonsterAttack(mon, target);
      result.actions.push({ type: 'attack', ...atkResult });
    } else {
      // Move toward target
      const path = this.findPath(mon.row, mon.col, target.row, target.col, mon.id);
      if (path.length > 1) {
        const stepIdx = Math.min(movRange, path.length - 2);
        if (stepIdx > 0) {
          const step = path[stepIdx];
          if (!this.isCellOccupied(step.row, step.col, mon.id)) {
            mon.row = step.row;
            mon.col = step.col;
            result.actions.push({ type: 'move', row: mon.row, col: mon.col, path: path.slice(0, stepIdx + 1) });
          }
        }

        // After moving, try attack
        const newDist = Math.abs(mon.row - target.row) + Math.abs(mon.col - target.col);
        if (newDist <= atkRange) {
          const atkResult = this.performMonsterAttack(mon, target);
          result.actions.push({ type: 'attack', ...atkResult });
        }
      }
    }

    return result;
  }

  performMonsterAttack(mon, hero) {
    // Armor penetration d20
    let armorRoll = this.rollDice(20);
    const confPenalty = getAttackPenalty(mon);
    if (confPenalty > 0) armorRoll = Math.max(1, armorRoll - confPenalty);

    const baseAtk = mon.attackMin
      ? mon.attackMin + Math.floor(Math.random() * (mon.attackMax - mon.attackMin + 1))
      : (mon.attack || 0);

    const heroArmor = this.getEntityArmor(hero);

    const critThreshold = (mon.abilities && mon.abilities.includes('quickStrike')) ? 17 : 20;
    const isCrit = armorRoll >= critThreshold;
    const penetrated = isCrit || (armorRoll !== 1 && armorRoll > heroArmor);

    if (!penetrated) {
      this.addLog(`Броня ${hero.name} выдержала удар ${mon.name} (🎲${armorRoll} vs ${heroArmor})`, 'log-action');
      return { penetrated: false, armorRoll, armorValue: heroArmor, targetId: hero.id };
    }

    // Damage
    const monDie = mon.damageDie || 6;
    const dmgRoll = this.rollDice(monDie);
    let dmg = dmgRoll + baseAtk;

    if (mon.abilities && mon.abilities.includes('aggressiveAttack')) {
      dmg += MONSTER_ABILITIES.aggressiveAttack.bonusDamage;
    }
    if (isCrit) dmg *= 2;

    // Apply damage with shields/reduction
    const dmgResult = applyDamage(hero, dmg);
    this.trackDamageTaken(hero.id, dmg);

    // Bleeding Bite
    if (mon.abilities && mon.abilities.includes('bleedingBite')) {
      const bleed = MONSTER_ABILITIES.bleedingBite;
      if (Math.random() < bleed.bleedChance) {
        applyStatus(hero, 'bleed', { damagePerTurn: bleed.bleedDamage, duration: bleed.bleedDuration });
        this.addLog(`${hero.name} кровоточит!`, 'log-damage');
      }
    }

    this.addLog(`${hero.name} получает ${dmg} урона от ${mon.name}${isCrit ? ' (КРИТ!)' : ''}`, 'log-damage');

    let killed = false;
    if (hero.hp <= 0) {
      killed = true;
      this.killEntity(hero);
    }

    return {
      penetrated: true, armorRoll, armorValue: heroArmor, isCrit,
      dmgRoll, damageDie: monDie, finalDmg: dmg,
      targetId: hero.id, targetHp: hero.hp, killed,
    };
  }

  selectTarget(mon, aliveHeroes) {
    if (mon.aiType === 'scout') {
      const priority = { mage: 0, priest: 1, bard: 1, warrior: 2 };
      const sorted = [...aliveHeroes].sort((a, b) => (priority[a.cls] || 2) - (priority[b.cls] || 2));
      const weak = sorted[0];
      const weakDist = Math.abs(weak.row - mon.row) + Math.abs(weak.col - mon.col);
      if (weakDist <= this.getEffectiveMoveRange(mon) + (mon.attackRange || 1) + 2) return weak;
    }
    if (mon.aiType === 'warrior') {
      const warriors = aliveHeroes.filter(h => h.cls === 'warrior');
      if (warriors.length > 0) return this.findNearest(warriors, mon);
    }
    if (mon.aiType === 'archer') {
      const weak = aliveHeroes.filter(h => h.cls === 'mage' || h.cls === 'priest' || h.cls === 'bard');
      if (weak.length > 0) return this.findNearest(weak, mon);
    }
    return this.findNearest(aliveHeroes, mon);
  }

  findNearest(entities, from) {
    let best = null, bestDist = Infinity;
    for (const e of entities) {
      const d = Math.abs(e.row - from.row) + Math.abs(e.col - from.col);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  monsterFlee(mon) {
    const aliveHeroes = this.gs.heroes.filter(h => h.hp > 0 && !h.dead);
    const nearest = this.findNearest(aliveHeroes, mon);
    if (!nearest) return { moved: false };

    const dr = mon.row - nearest.row;
    const dc = mon.col - nearest.col;
    const ndR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
    const ndC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
    let moveR = ndR, moveC = ndC;
    if (Math.abs(dr) > Math.abs(dc)) moveC = 0;
    else if (Math.abs(dc) > Math.abs(dr)) moveR = 0;

    const newR = mon.row + moveR;
    const newC = mon.col + moveC;
    if (this.isValidCell(newR, newC) && this.gs.map[newR][newC] !== 'wall' &&
        !this.isCellOccupied(newR, newC, mon.id)) {
      mon.row = newR;
      mon.col = newC;
      return { moved: true, row: newR, col: newC };
    }
    return { moved: false };
  }

  monsterRetreat(mon, target, steps) {
    for (let i = 0; i < steps; i++) {
      const dr = mon.row - target.row;
      const dc = mon.col - target.col;
      const ndR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
      const ndC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
      const newR = mon.row + ndR;
      const newC = mon.col + ndC;
      if (this.isValidCell(newR, newC) && this.gs.map[newR][newC] !== 'wall' &&
          !this.isCellOccupied(newR, newC, mon.id)) {
        mon.row = newR;
        mon.col = newC;
      }
    }
  }

  // ============================================================
  // COMBAT MANAGEMENT
  // ============================================================

  /**
   * Initialize combat — roll initiative, set up turn order
   */
  initCombat(aggroMonsters) {
    this.gs.mode = 'combat';
    this.gs.combatMonsters = aggroMonsters.map(m => m.id);

    // Calculate combat zone
    this.gs.combatZone = this.calculateCombatZone(aggroMonsters);

    // Determine combat heroes
    this.gs.combatHeroes = this.gs.heroes
      .filter(h => h.hp > 0 && !h.dead && !h.leftGame &&
        this.gs.combatZone.some(z => z.row === h.row && z.col === h.col))
      .map(h => h.id);

    // Roll initiative
    const participants = [];

    this.gs.heroes.forEach(h => {
      if (this.gs.combatHeroes.includes(h.id)) {
        let bonus = 10;
        if (h.surpriseAttack) bonus += SURPRISE_INITIATIVE_BONUS;
        const roll = this.rollDice(6);
        participants.push({
          entityId: h.id, type: 'hero',
          initiative: bonus + roll, roll,
        });
      }
    });

    aggroMonsters.forEach(m => {
      if (m.hp > 0) {
        const roll = this.rollDice(6);
        participants.push({
          entityId: m.id, type: 'monster',
          initiative: (m.agility || 5) + roll, roll,
        });
      }
    });

    // Sort descending
    participants.sort((a, b) => b.initiative - a.initiative);
    this.gs.turnOrder = participants;
    this.gs.currentTurnIdx = 0;
    this.gs.round = 1;

    return {
      type: 'combat_started',
      turnOrder: participants,
      combatZone: this.gs.combatZone,
      combatHeroes: this.gs.combatHeroes,
      combatMonsters: this.gs.combatMonsters,
    };
  }

  calculateCombatZone(monsters) {
    const zone = [];
    const seen = new Set();
    for (const mon of monsters) {
      for (let r = mon.row - COMBAT_ZONE_RANGE; r <= mon.row + COMBAT_ZONE_RANGE; r++) {
        for (let c = mon.col - COMBAT_ZONE_RANGE; c <= mon.col + COMBAT_ZONE_RANGE; c++) {
          if (this.isValidCell(r, c)) {
            const key = `${r},${c}`;
            if (!seen.has(key)) {
              seen.add(key);
              zone.push({ row: r, col: c });
            }
          }
        }
      }
    }
    return zone;
  }

  checkCombatEnd() {
    if (this.gs.mode !== 'combat') return null;

    const aliveMonsters = this.gs.monsters.filter(m =>
      this.gs.combatMonsters.includes(m.id) && m.hp > 0);
    const aliveHeroes = this.gs.heroes.filter(h =>
      h.hp > 0 && !h.dead && !h.leftGame);

    if (aliveMonsters.length === 0) {
      return this.endCombat('victory');
    }
    if (aliveHeroes.length === 0) {
      return this.endCombat('defeat');
    }
    return null;
  }

  endCombat(result) {
    this.gs.mode = 'explore';
    this.gs.turnOrder = [];
    this.gs.combatMonsters = [];
    this.gs.combatZone = [];
    this.gs.combatHeroes = [];
    this.gs.activeHeroIdx = 0;
    this.gs.moveUsed = false;
    this.gs.actionUsed = false;
    this.gs.bonusActionUsed = false;

    // Generate match summary
    const summary = this.generateMatchSummary(result);

    this.addLog(result === 'victory'
      ? 'Бой окончен! Все враги повержены.'
      : 'Бой окончен. Герои пали...', 'log-discovery');

    return {
      type: 'combat_ended',
      result,
      summary,
      matchStats: this.gs.matchStats,
    };
  }

  checkAggroAfterMove(hero) {
    const newlyAggro = [];
    for (const mon of this.gs.monsters) {
      if (mon.hp <= 0 || mon.fled || mon.aggro) continue;
      const dist = Math.abs(mon.row - hero.row) + Math.abs(mon.col - hero.col);
      if (dist <= ENCOUNTER_RANGE) {
        mon.aggro = true;
        newlyAggro.push(mon);
      }
    }
    return newlyAggro;
  }

  // ============================================================
  // ENTITY DEATH
  // ============================================================

  killEntity(entity) {
    entity.dead = true;
    entity.hp = 0;
    clearStatuses(entity);

    // Remove from turn order
    const idx = this.gs.turnOrder.findIndex(t => t.entityId === entity.id);
    if (idx !== -1) {
      this.gs.turnOrder.splice(idx, 1);
      // Adjust currentTurnIdx
      if (idx < this.gs.currentTurnIdx) {
        this.gs.currentTurnIdx--;
      } else if (idx === this.gs.currentTurnIdx) {
        // Current entity died — move back so advanceTurn increments correctly
        this.gs.currentTurnIdx--;
      }
      if (this.gs.currentTurnIdx < 0) this.gs.currentTurnIdx = 0;
    }

    this.addLog(`${entity.name} повержен!`, 'log-discovery');

    return { type: 'entity_died', entityId: entity.id, entityName: entity.name };
  }

  // ============================================================
  // MAP / MOVEMENT HELPERS
  // ============================================================

  isValidCell(row, col) {
    if (!this.gs.map) return false;
    return row >= 0 && row < this.gs.map.length && col >= 0 && col < this.gs.map[0].length;
  }

  isCellOccupied(row, col, excludeId) {
    const heroOn = this.gs.heroes.some(h =>
      !h.dead && !h.leftGame && h.row === row && h.col === col && h.id !== excludeId);
    if (heroOn) return true;
    const monOn = this.gs.monsters.some(m =>
      m.hp > 0 && !m.fled && m.row === row && m.col === col && m.id !== excludeId);
    if (monOn) return true;
    return this.hasBlockingObject(row, col);
  }

  hasBlockingObject(r, c) {
    if (!this.gs.objects) return false;
    return this.gs.objects.some(o => {
      if (o.row !== r || o.col !== c) return false;
      if (o.hidden) return false;
      if (o.type === 'chest' && !o.opened) return true;
      if (o.type === 'rune' && !o.activated) return true;
      if (o.type === 'artifact') return true;
      return false;
    });
  }

  getEffectiveMoveRange(entity) {
    const terrain = this.gs.terrain && this.gs.terrain[entity.row] && this.gs.terrain[entity.row][entity.col];
    const onRoad = terrain === 'road';
    let baseRange = entity.moveRange || BASE_MOVE_RANGE;

    // Status reductions (frozen, slowed)
    const reduction = getMoveReduction(entity);
    if (reduction > 0) baseRange = Math.max(0, baseRange - reduction);

    // Status bonus (haste)
    const bonus = getMoveBonus(entity);
    if (bonus > 0) baseRange += bonus;

    // Rooted — no movement
    if (hasModifier(entity, 'blockMovement')) return 0;

    return onRoad ? baseRange : Math.min(baseRange, OFFROAD_MOVE_RANGE);
  }

  getReachableCells(startR, startC, range, excludeId) {
    const reachable = [];
    const bestCost = {};
    const key = (r, c) => r * 1000 + c;

    const queue = [{ row: startR, col: startC, cost: 0 }];
    bestCost[key(startR, startC)] = 0;

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const { row, col, cost } = queue.shift();

      if (cost > (bestCost[key(row, col)] ?? Infinity)) continue;

      if (cost > 0 && !this.isCellOccupied(row, col, excludeId)) {
        const terrain = this.gs.terrain && this.gs.terrain[row] && this.gs.terrain[row][col];
        reachable.push({ row, col, offRoad: terrain !== 'road', cost });
      }
      if (cost >= range) continue;

      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of neighbors) {
        const nr = row + dr;
        const nc = col + dc;
        if (!this.isValidCell(nr, nc)) continue;
        if (this.gs.map[nr][nc] === 'wall') continue;
        if (this.hasBlockingObject(nr, nc)) continue;

        const newCost = cost + 1;
        if (newCost > range) continue;

        const k = key(nr, nc);
        if (newCost < (bestCost[k] ?? Infinity)) {
          bestCost[k] = newCost;
          queue.push({ row: nr, col: nc, cost: newCost });
        }
      }
    }
    return reachable;
  }

  findPath(startR, startC, endR, endC, excludeId) {
    if (!this.gs.map) return [];
    const rows = this.gs.map.length;
    const cols = this.gs.map[0].length;
    const open = [{ row: startR, col: startC, g: 0, h: 0, f: 0, parent: null }];
    const closed = new Set();

    const key = (r, c) => r * 1000 + c;
    const heuristic = (r, c) => Math.abs(r - endR) + Math.abs(c - endC);

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      const ck = key(current.row, current.col);

      if (current.row === endR && current.col === endC) {
        const path = [];
        let node = current;
        while (node) { path.unshift({ row: node.row, col: node.col }); node = node.parent; }
        return path;
      }

      closed.add(ck);

      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of neighbors) {
        const nr = current.row + dr;
        const nc = current.col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (this.gs.map[nr][nc] === 'wall') continue;
        const nk = key(nr, nc);
        if (closed.has(nk)) continue;
        if (this.hasBlockingObject(nr, nc)) continue;

        // Allow target cell to be occupied (by the target)
        if (!(nr === endR && nc === endC)) {
          if (this.isCellOccupied(nr, nc, excludeId)) continue;
        }

        const g = current.g + 1;
        const existing = open.find(n => n.row === nr && n.col === nc);
        if (existing && g >= existing.g) continue;

        const h = heuristic(nr, nc);
        if (existing) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        } else {
          open.push({ row: nr, col: nc, g, h, f: g + h, parent: current });
        }
      }
    }
    return [];
  }

  hasLineOfSight(r1, c1, r2, c2) {
    // Bresenham's line algorithm
    let x0 = c1, y0 = r1, x1 = c2, y1 = r2;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      // Skip start and end cells
      if (!(x0 === c1 && y0 === r1) && !(x0 === c2 && y0 === r2)) {
        if (this.isValidCell(y0, x0) && this.gs.map[y0][x0] === 'wall') {
          return false;
        }
      }

      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  // ============================================================
  // COMBAT HELPERS
  // ============================================================

  getEntityArmor(entity) {
    let armor = entity.armor || 0;

    // Equipment bonus for heroes
    if (entity.equipment) {
      const armorItem = entity.equipment.armor;
      if (armorItem && armorItem.armor) armor += armorItem.armor;
      const shield = entity.equipment.shield;
      if (shield && shield.armor) armor += shield.armor;
    }

    // Temp armor
    if (entity.tempArmor) armor += entity.tempArmor;

    // Brittle — reduce armor
    const brittleReduction = getModifier(entity, 'armorReduction');
    if (brittleReduction > 0) armor = Math.max(0, armor - brittleReduction);

    return armor;
  }

  getHeroDamageDie(hero) {
    const weapon = hero.equipment && hero.equipment.weapon;
    if (!weapon) return 4;
    return weapon.damageDie || 6;
  }

  checkDodge(target) {
    if (target.abilities && target.abilities.includes('dodge')) {
      const dodgeChance = MONSTER_ABILITIES.dodge.dodgeChance;
      if (Math.random() < dodgeChance) return true;
    }
    // Shield block preparation
    if (target.abilities && target.abilities.includes('shieldBlock') && (target.shieldBlockCooldown || 0) <= 0) {
      target.shieldBlockActive = true;
      target.shieldBlockCooldown = MONSTER_ABILITIES.shieldBlock.cooldown;
    }
    return false;
  }

  processMarksOnDamage(attacker, target, actionType, abilityId) {
    if (!target.statusEffects) return;

    target.statusEffects.forEach(mark => {
      if (mark.type === 'vanguard_amplify' && mark.bonusDmg) {
        target.hp = Math.max(0, target.hp - mark.bonusDmg);
        this.addLog(`Усиленный удар! +${mark.bonusDmg} урона (метка)`, 'log-damage');
        mark.duration = 0;
      }
      if (mark.type === 'void_mark' && mark.bonusPureDmg) {
        target.hp = Math.max(0, target.hp - mark.bonusPureDmg);
        if (mark.manaReturn && attacker.mp !== undefined) {
          attacker.mp = Math.min(attacker.maxMp || 99, (attacker.mp || 0) + mark.manaReturn);
        }
        mark.duration = 0;
      }
      if (mark.type === 'static_mark' && mark.dischargeDmg) {
        target.hp = Math.max(0, target.hp - mark.dischargeDmg);
      }
      if (mark.type === 'fire_mark' && mark.bonusFireDmg && actionType === 'ability') {
        // Only trigger for flame branch abilities
        mark.duration = 0;
      }
    });

    // Clean consumed marks
    target.statusEffects = target.statusEffects.filter(e => e.duration > 0 || e.duration === undefined);
  }

  processZoneEffects() {
    if (!this.gs.zones) return;

    const allEntities = [
      ...this.gs.monsters.filter(m => m.hp > 0 && !m.fled),
      ...this.gs.heroes.filter(h => h.hp > 0 && !h.dead && !h.leftGame),
    ];

    this.gs.zones = this.gs.zones.filter(zone => {
      if (zone.turnEndDmg) {
        allEntities.forEach(ent => {
          const dist = Math.abs(ent.row - zone.row) + Math.abs(ent.col - zone.col);
          if (dist <= zone.range) {
            ent.hp = Math.max(0, ent.hp - zone.turnEndDmg);
            if (ent.hp <= 0) this.killEntity(ent);
          }
        });
      }
      zone.duration--;
      return zone.duration > 0;
    });
  }

  // ============================================================
  // ABILITY MECHANICS (port from abilities.js)
  // ============================================================

  /**
   * Get ability mechanics — simplified server version.
   * In production, should import from shared abilities module.
   */
  getAbilityMechanics(abilityId) {
    // This will be populated from abilities.js data
    // For now, use the catalog if available
    if (this.gs._abilityCatalog && this.gs._abilityCatalog[abilityId]) {
      return this.gs._abilityCatalog[abilityId];
    }
    // Fallback: try to load from shared module
    try {
      const { getAbilityMechanics: getMech } = require('../../abilities.js');
      return getMech(abilityId);
    } catch (e) {
      // Default fallback
      return {
        passive: false,
        targetType: 'enemy',
        range: 3,
        manaCost: 4,
        damageDie: 6,
        bonusStat: 'attack',
        statusEffect: null,
        aoe: null,
        branchBonus: {},
        specific: null,
      };
    }
  }

  // ============================================================
  // MATCH STATISTICS
  // ============================================================

  initStats(heroId) {
    if (!this.gs.matchStats[heroId]) {
      this.gs.matchStats[heroId] = {
        damageDealt: 0,
        damageTaken: 0,
        statusesApplied: 0,
        kills: 0,
        assists: 0,
        ccAttempts: 0,
        ccSuccesses: 0,
        recentDamageTo: {}, // targetId → lastRound
      };
    }
  }

  trackDamage(heroId, amount) {
    this.initStats(heroId);
    this.gs.matchStats[heroId].damageDealt += amount;
  }

  trackDamageTaken(entityId, amount) {
    // Track for heroes only
    const hero = this.findHero(entityId);
    if (!hero) return;
    this.initStats(entityId);
    this.gs.matchStats[entityId].damageTaken += amount;
  }

  trackKill(killerId, targetId) {
    this.initStats(killerId);
    this.gs.matchStats[killerId].kills++;

    // Track assists: anyone who damaged this target in last 2 rounds
    for (const [heroId, stats] of Object.entries(this.gs.matchStats)) {
      if (heroId === killerId) continue;
      if (stats.recentDamageTo && stats.recentDamageTo[targetId]) {
        const roundDiff = this.gs.round - stats.recentDamageTo[targetId];
        if (roundDiff <= 2) {
          stats.assists++;
        }
      }
    }
  }

  trackStatusApplied(heroId) {
    this.initStats(heroId);
    this.gs.matchStats[heroId].statusesApplied++;
  }

  generateMatchSummary(result) {
    const players = [];
    for (const hero of this.gs.heroes) {
      const stats = this.gs.matchStats[hero.id] || {
        damageDealt: 0, damageTaken: 0, statusesApplied: 0,
        kills: 0, assists: 0, ccAttempts: 0, ccSuccesses: 0,
      };
      const ccEfficiency = stats.ccAttempts > 0
        ? Math.round((stats.ccSuccesses / stats.ccAttempts) * 100) / 100
        : 0;

      players.push({
        heroId: hero.id,
        heroName: hero.name,
        heroCls: hero.cls,
        ownerId: hero._ownerId,
        damageDealt: stats.damageDealt,
        damageTaken: stats.damageTaken,
        statusesApplied: stats.statusesApplied,
        ccEfficiency,
        kills: stats.kills,
        assists: stats.assists,
        synergies: [], // TODO: detect synergy patterns
      });
    }

    return {
      result,
      rounds: this.gs.round,
      players,
    };
  }

  // ============================================================
  // LOGGING
  // ============================================================

  addLog(message, type = 'log-action') {
    this.actionLog.push({ message, type, timestamp: Date.now() });
  }

  getActionLog() {
    const log = [...this.actionLog];
    this.actionLog = [];
    return log;
  }
}

module.exports = GameEngine;
