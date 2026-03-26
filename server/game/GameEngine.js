'use strict';

const {
  applyStatus, tickStatuses, removeStatus, clearStatuses,
  hasStatus, getStatus, getModifier, hasModifier,
  getMoveReduction, getAttackPenalty, getDamageBonus,
  getDamageReduction, getVulnerability, getMoveBonus,
  absorbShieldDamage, applyDamage, getActiveEffects,
} = require('./StatusEffects');
const LootGenerator = require('./LootGenerator');

// ============================================================
// CONSTANTS
// ============================================================

// Movement
const BASE_MOVE_RANGE = 4;
const OFFROAD_MOVE_RANGE = 1;
const OFFROAD_COST = 1;
const OBSTACLE_STEP_COST = 2;

// Combat
const SURPRISE_INITIATIVE_BONUS = 10;
const SURPRISE_DAMAGE_BONUS = 5;
const SURPRISE_CRIT_BONUS = 0.20;
const CRIT_DAMAGE_MULTIPLIER = 2;
const AGGRO_RANGE = 2;          // Chebyshev distance — triggers combat
const COMBAT_JOIN_RANGE = 5;    // Chebyshev — all heroes/enemies within join combat (multiplayer)
const COMBAT_ZONE_RANGE = 5;    // Combat zone boundary
const ENCOUNTER_RANGE = 3;      // Legacy — used for NPC detection
const NPC_INTERACT_RANGE = 4;

// Chebyshev distance helper (includes diagonals)
const chebyshevDist = (r1, c1, r2, c2) => Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));

// Fog of war
const FOG_HIDDEN = 0;
const FOG_EXPLORED = 1;
const FOG_VISIBLE = 2;
const FULL_VISION_RADIUS = 5;
const PARTIAL_VISION_RADIUS = 4;

// Search / scouting
const SEARCH_RADIUS = 5;
const SEARCH_SUCCESS_DC = 10;

// Hazardous terrain
const BURNING_DAMAGE = 2;
const BURNING_DURATION = 3;
const DROWNING_DC = 10;

// Traps
const TRAP_DISARM_DC = 12;

// Rewards defaults
const DEFAULT_XP_REWARD = 20;
const DEFAULT_GOLD_MIN = 5;
const DEFAULT_GOLD_MAX = 15;
const ELITE_HP_THRESHOLD = 40;

// NPC defaults
const DEFAULT_NPC_HP = 50;
const DEFAULT_TRADER_HP = 10;
const DEFAULT_QUEST_NPC_HP = 30;

// Monster abilities lookup (subset for server-side AI)
const MONSTER_ABILITIES = {
  aggressiveAttack: { bonusDamage: 2 },
  bleedingBite: { bleedChance: 0.3, bleedDamage: 2, bleedDuration: 2 },
  dodge: { dodgeChance: 0.25 },
  shieldBlock: { damageReduction: 4, cooldown: 2 },
  quickStrike: { critThreshold: 17 },
};

// Pathfinding key helper (assumes grid < 1000 cols)
const pathKey = (r, c) => r * 1000 + c;

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
    let hero;

    if (this.gs.mode === 'combat' && this.gs.turnOrder?.length) {
      // Combat mode: use turn order
      const currentTurn = this.gs.turnOrder[this.gs.currentTurnIdx];
      if (!currentTurn) return { ok: false, error: 'Нет активного хода' };

      if (currentTurn.type !== 'hero') return { ok: false, error: 'Сейчас ход монстра' };
      hero = this.findHero(action.heroId || currentTurn.entityId);
      if (!hero) return { ok: false, error: 'Герой не найден' };

      // Strict ownership check
      if (hero._ownerId && hero._ownerId !== userId) return { ok: false, error: 'Не ваш герой' };
      if (!hero._ownerId && this.players.length > 0) {
        this._assignOwnership();
        if (hero._ownerId && hero._ownerId !== userId) return { ok: false, error: 'Не ваш герой' };
      }

      // Active turn check
      if (hero.id !== currentTurn.entityId) return { ok: false, error: 'Сейчас не ход этого героя' };
    } else {
      // Explore mode: use activeHeroIdx or find by userId
      hero = this.findHero(action.heroId);
      if (!hero) {
        // Find hero owned by this user
        hero = this.gs.heroes.find(h => h._ownerId === userId || h.userId === userId);
      }
      if (!hero) return { ok: false, error: 'Герой не найден' };

      // Ownership check
      if (hero._ownerId && hero._ownerId !== userId) return { ok: false, error: 'Не ваш герой' };

      // Set heroId on action for downstream processing
      action.heroId = hero.id;
    }

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
      case 'interact':
        return this.validateInteract(hero, action);
      case 'search':
        return this.validateSearch(hero, action);
      case 'magic-vision':
        return hero.actionUsed ? { ok: false, error: 'Действие уже использовано' } : { ok: true };
      case 'talk': {
        const npc = this.gs.monsters.find(m => m.id === action.targetId && m.alive);
        if (!npc) return { ok: false, error: 'НПС не найден' };
        const dist = Math.abs(hero.row - npc.row) + Math.abs(hero.col - npc.col);
        if (dist > NPC_INTERACT_RANGE) return { ok: false, error: 'Слишком далеко' };
        return { ok: true };
      }
      case 'sneak':
        return this.gs.actionUsed ? { ok: false, error: 'Действие уже использовано' } : { ok: true };
      case 'eavesdrop':
        return this.gs.actionUsed ? { ok: false, error: 'Действие уже использовано' } : { ok: true };
      case 'magic-vision':
        return this.gs.actionUsed ? { ok: false, error: 'Действие уже использовано' } : { ok: true };
      case 'free-action':
        return hero.bonusActionUsed ? { ok: false, error: 'Бонусное действие уже использовано' } : { ok: true };
      case 'resolve-damage':
        return this.gs._pendingDamage ? { ok: true } : { ok: false, error: 'Нет ожидающего урона' };
      case 'loot-chest':
        return { ok: true };
      case 'end-turn':
        return { ok: true };
      default:
        return { ok: false, error: `Неизвестный тип действия: ${action.type}` };
    }
  }

  validateMove(hero, action) {
    // Ход уже использован? Check hero-level first, then global
    if (hero.moveUsed || this.gs.moveUsed) return { ok: false, error: 'Перемещение уже использовано' };

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
    // Способность = дополнительное действие
    if (this.gs.bonusActionUsed) {
      return { ok: false, error: 'Дополнительное действие уже использовано' };
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
  async processAction(userId, action) {
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
      case 'interact':
        result = await this.executeInteract(action);
        break;
      case 'search':
        result = this.executeSearch(action);
        break;
      case 'magic-vision':
        result = this.executeMagicVision(action);
        break;
      case 'talk':
        result = this.executeTalk(action);
        break;
      case 'sneak':
        result = this.executeSneak(action);
        break;
      case 'eavesdrop':
        result = this.executeEavesdrop(action);
        break;
      case 'free-action':
        result = this.executeFreeAction(action);
        break;
      case 'resolve-damage':
        result = this.resolveDamage(action);
        break;
      case 'loot-chest':
        result = this.executeLootChest(action);
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
    const stepsTaken = path.length > 0 ? path.length - 1 : 1;

    // Move hero
    hero.row = action.targetRow;
    hero.col = action.targetCol;

    // Deduct steps
    hero.stepsRemaining = Math.max(0, (hero.stepsRemaining || 0) - stepsTaken);
    if (hero.stepsRemaining <= 0) {
      hero.moveUsed = true;
      this.gs.moveUsed = true;
    }

    // Log
    this.addLog(`${hero.name} перемещается`, 'log-action');

    // Update fog of war around new position
    this._updateFogForHero(hero);

    // Check hazardous terrain (fire, water)
    const hazardEvents = this._checkHazardousTerrain(hero);

    // Check for traps, encounters, etc. (simplified)
    const events = [...hazardEvents];

    // In explore mode, check for monster aggro → auto-start combat
    let combatStarted = false;
    if (this.gs.mode === 'explore') {
      const aggroMonsters = this.checkAggroAfterMove(hero);
      if (aggroMonsters.length > 0) {
        // Also pull in all enemies within COMBAT_JOIN_RANGE of the encounter
        const allNearby = this.gs.monsters.filter(m =>
          m.hp > 0 && !m.friendly && !m.fled && !m.aggro &&
          aggroMonsters.some(am => chebyshevDist(m.row, m.col, am.row, am.col) <= COMBAT_JOIN_RANGE)
        );
        allNearby.forEach(m => { m.aggro = true; m.discovered = true; });
        const allCombatMonsters = [...aggroMonsters, ...allNearby];

        this.initCombat(allCombatMonsters);
        combatStarted = true;
        events.push({
          type: 'encounter',
          monsters: allCombatMonsters.map(m => ({ id: m.id, name: m.name, row: m.row, col: m.col })),
        });
      }
    }

    return {
      type: 'move',
      heroId: hero.id,
      heroName: hero.name,
      fromRow, fromCol,
      toRow: hero.row,
      toCol: hero.col,
      to: { x: hero.col, y: hero.row },
      path,
      events,
      combatStarted,
      ...(combatStarted ? {
        turnOrder: this.gs.turnOrder,
        combatZone: this.gs.combatZone,
        combatHeroes: this.gs.combatHeroes,
        combatMonsters: this.gs.combatMonsters,
      } : {}),
      stepsRemaining: hero.stepsRemaining,
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
        heroId: hero.id, heroName: hero.name,
        targetId: target.id, targetName: target.name,
        d20: armorRoll, effectiveArmor: armorValue,
        penetrated: false, isCrit: false, shieldBlocked,
        diceRolls: [{ diceType: 'd20', roll: armorRoll, label: '⚔ Атака', message: `${hero.name} → ${target.name}`, success: false, resultText: `<span class="dice-result-fail">❌ d20=${armorRoll} ≤ броня ${armorValue} — Заблокировано!</span>` }],
      };
    }

    // Penetrated! Now player rolls damage dice
    const damageDie = this.getHeroDamageDie(hero);
    const surpriseBonus = hero.surpriseAttack ? SURPRISE_DAMAGE_BONUS : 0;
    let attackBonus = (hero.attack || 0) + surpriseBonus;
    const inspiredBonus = getDamageBonus(hero);
    attackBonus += inspiredBonus;
    const vulnBonus = getVulnerability(target);
    attackBonus += vulnBonus;

    // Determine dice notation (e.g., 'd8', '2d6')
    const weapon = hero.equipment?.weapon;
    const diceCount = weapon?.diceCount || 1;
    const diceNotation = diceCount > 1 ? `${diceCount}d${damageDie}` : `d${damageDie}`;

    // Store pending damage context for resolve-damage
    this.gs._pendingDamage = {
      heroId: hero.id,
      targetId: target.id,
      attackBonus,
      isCrit,
      inspiredBonus,
      vulnBonus,
    };

    // Clear surprise
    if (hero.surpriseAttack) {
      hero.surpriseAttack = false;
      hero.stealth = 0;
    }
    if (inspiredBonus > 0) removeStatus(hero, 'inspired');

    this.gs.actionUsed = true;

    this.addLog(`${hero.name} пробивает броню ${target.name}! Бросьте кубик урона...`, 'log-action');

    return {
      type: 'attack',
      heroId: hero.id, heroName: hero.name,
      targetId: target.id, targetName: target.name,
      d20: armorRoll, effectiveArmor: armorValue,
      penetrated: true, isCrit,
      // Interactive damage: client must roll and send resolve-damage
      pendingDamage: true,
      damageDice: diceNotation,
      diceType: `d${damageDie}`,
      diceCount,
      attackBonus,
      hits: true,
      diceRolls: [
        { diceType: 'd20', roll: armorRoll, label: '⚔ Попадание', message: `${hero.name} → ${target.name}`, success: true },
      ],
    };
  }

  // ============================================================
  // RESOLVE DAMAGE — player rolled damage dice, apply result
  // ============================================================

  resolveDamage(action) {
    const pending = this.gs._pendingDamage;
    if (!pending) return { type: 'resolve-damage', error: 'Нет ожидающего урона' };

    const hero = this.findHero(pending.heroId);
    const target = this.gs.monsters.find(m => m.id === pending.targetId) ||
                   this.gs.heroes.find(h => h.id === pending.targetId);
    if (!target) { this.gs._pendingDamage = null; return { type: 'resolve-damage', error: 'Цель не найдена' }; }

    const rolls = action.rolls || [action.roll || 1];
    const dmgRoll = rolls.reduce((s, v) => s + v, 0);
    const targetArmor = this.getEntityArmor(target);
    const baseDmg = Math.max(1, dmgRoll + pending.attackBonus - targetArmor);
    const finalDmg = pending.isCrit ? baseDmg * CRIT_DAMAGE_MULTIPLIER : baseDmg;

    applyDamage(target, finalDmg);
    if (hero) this.processMarksOnDamage(hero, target, 'attack', null);
    if (finalDmg > 0 && hasStatus(target, 'sleep')) removeStatus(target, 'sleep');
    if (hero) { this.trackDamage(hero.id, finalDmg); this.trackDamageTaken(target.id, finalDmg); }

    let killed = false;
    if (target.hp <= 0) { killed = true; this.killEntity(target); if (hero) this.trackKill(hero.id, target.id); }

    const heroName = hero?.name || 'Герой';
    this.addLog(`${heroName} наносит ${finalDmg} урона ${target.name}${pending.isCrit ? ' (КРИТ!)' : ''}`, 'log-damage');
    this.gs._pendingDamage = null;

    let combatEnded = null;
    if (this.gs.mode === 'combat') combatEnded = this.checkCombatEnd();

    return {
      type: 'resolve-damage', heroId: pending.heroId, heroName,
      targetId: target.id, targetName: target.name,
      rolls, dmgRoll, attackBonus: pending.attackBonus, finalDmg,
      isCrit: pending.isCrit, targetHp: target.hp, targetMaxHp: target.maxHp,
      targetAlive: target.hp > 0, killed, combatEnded,
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
      // Ability = bonus action (дополнительное действие)
      this.gs.bonusActionUsed = true;
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
      this.gs.bonusActionUsed = true;
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

    // Ability = bonus action (дополнительное действие)
    this.gs.bonusActionUsed = true;

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
  // VALIDATE & EXECUTE: SEARCH (scouting)
  // ============================================================

  validateSearch(hero, action) {
    if (this.gs.actionUsed) return { ok: false, error: 'Действие уже использовано' };
    return { ok: true };
  }

  executeSearch(action) {
    const hero = this.findHero(action.heroId);
    const roll = this.rollDice(20);
    const wisdomBonus = hero.wisdom || 0;
    const total = roll + wisdomBonus;

    const radius = SEARCH_RADIUS;

    // Discover hidden objects and monsters in radius
    const discovered = [];
    const ROWS = this.gs.map.length;
    const COLS = this.gs.map[0]?.length || 0;

    for (let r = Math.max(0, hero.row - radius); r <= Math.min(ROWS - 1, hero.row + radius); r++) {
      for (let c = Math.max(0, hero.col - radius); c <= Math.min(COLS - 1, hero.col + radius); c++) {
        const dist = Math.abs(r - hero.row) + Math.abs(c - hero.col);
        if (dist > radius) continue;

        // Reveal fog
        if (this.gs.fog[r] && this.gs.fog[r][c] < 2) {
          this.gs.fog[r][c] = 2;
        }

        // Discover hidden monsters
        for (const m of this.gs.monsters) {
          if (m.row === r && m.col === c && m.alive && !m.discovered) {
            m.discovered = true;
            discovered.push({ type: 'monster', name: m.name, row: r, col: c });
          }
        }

        // Discover hidden objects (traps, runes)
        for (const obj of this.gs.objects) {
          if (obj.row === r && obj.col === c && obj.hidden && !obj.discovered) {
            obj.discovered = true;
            discovered.push({ type: obj.type, name: obj.name || obj.type, row: r, col: c });
          }
        }
      }
    }

    this.gs.actionUsed = true;
    hero.actionUsed = true;

    const success = total >= 10;
    this.addLog(`🔍 ${hero.name} проводит разведку (d20=${roll}+${wisdomBonus}=${total}): радиус ${radius}, найдено ${discovered.length}`, success ? 'log-action' : 'log-damage');

    return {
      type: 'search',
      heroId: hero.id, heroName: hero.name,
      roll, bonus: wisdomBonus, total,
      radius, success,
      discovered,
      diceRolls: [{
        diceType: 'd20', roll, bonus: wisdomBonus,
        label: '🔍 Разведка',
        message: `${hero.name}: d20 + МУД(${wisdomBonus})`,
        success,
        resultText: success
          ? `<span class="dice-result-success">✅ d20=${roll}+${wisdomBonus}=${total} — Радиус ${radius}, найдено: ${discovered.length}</span>`
          : `<span class="dice-result-fail">❌ d20=${roll}+${wisdomBonus}=${total} — Почти ничего не видно</span>`,
      }],
    };
  }

  // ============================================================
  // SNEAK — stealth mode, reduces enemy detection
  // ============================================================

  executeSneak(action) {
    const hero = this.findHero(action.heroId);
    const SNEAK_DC = 12;
    const roll = action.roll || this.rollDice(20);
    const agiBonus = Math.floor(((hero.agility || 0) - 10) / 2);
    const total = roll + agiBonus;
    const success = total >= SNEAK_DC;

    if (success) {
      applyStatus(hero, 'stealth', { duration: 3 });
      this.addLog(`🥷 ${hero.name} успешно крадётся! Скрытность на 3 хода`, 'log-action');
    } else {
      // Alert nearby enemies
      const nearbyMonsters = this.gs.monsters.filter(m => m.alive && !m.friendly && Math.abs(m.row - hero.row) + Math.abs(m.col - hero.col) <= ENCOUNTER_RANGE);
      nearbyMonsters.forEach(m => { m.aggro = true; m.discovered = true; });
      this.addLog(`🥷 ${hero.name} замечен! ${nearbyMonsters.length} врагов насторожились`, 'log-damage');
    }

    hero.actionUsed = true;
    this.gs.actionUsed = true;

    return {
      type: 'sneak', heroId: hero.id, heroName: hero.name,
      roll, bonus: agiBonus, total, dc: SNEAK_DC, success,
      diceRolls: [{ diceType: 'd20', roll, bonus: agiBonus, label: '🥷 Скрытность',
        message: `${hero.name}: d20 + ЛОВ(${agiBonus}) ≥ DC${SNEAK_DC}`, success }],
    };
  }

  // ============================================================
  // EAVESDROP — listen to nearby NPCs/monsters for intel
  // ============================================================

  executeEavesdrop(action) {
    const hero = this.findHero(action.heroId);
    const EAVESDROP_DC = 10;
    const roll = action.roll || this.rollDice(20);
    const wisBonus = Math.floor(((hero.wisdom || 0) - 10) / 2);
    const total = roll + wisBonus;
    const success = total >= EAVESDROP_DC;

    let info = '';
    if (success) {
      // Find nearby enemies and reveal info
      const nearby = this.gs.monsters.filter(m => m.alive && !m.friendly &&
        Math.abs(m.row - hero.row) + Math.abs(m.col - hero.col) <= SEARCH_RADIUS);
      if (nearby.length > 0) {
        nearby.forEach(m => { m.discovered = true; });
        const names = nearby.map(m => `${m.name} (HP:${m.hp})`).join(', ');
        info = `Рядом: ${names}`;
        this.addLog(`👂 ${hero.name} подслушивает: ${info}`, 'log-action');
      } else {
        info = 'Тишина... врагов поблизости нет';
        this.addLog(`👂 ${hero.name}: тишина рядом`, 'log-action');
      }
      // Also reveal hidden objects
      this.gs.objects.filter(o => !o.discovered &&
        Math.abs(o.row - hero.row) + Math.abs(o.col - hero.col) <= SEARCH_RADIUS
      ).forEach(o => { o.discovered = true; });
    } else {
      info = 'Не удалось ничего расслышать';
      this.addLog(`👂 ${hero.name} ничего не услышал`, 'log-damage');
    }

    hero.actionUsed = true;
    this.gs.actionUsed = true;

    return {
      type: 'eavesdrop', heroId: hero.id, heroName: hero.name,
      roll, bonus: wisBonus, total, dc: EAVESDROP_DC, success, info,
      diceRolls: [{ diceType: 'd20', roll, bonus: wisBonus, label: '👂 Подслушивание',
        message: `${hero.name}: d20 + МУД(${wisBonus}) ≥ DC${EAVESDROP_DC}`, success }],
    };
  }

  // ============================================================
  // MAGIC VISION — reveals runes on success
  // ============================================================

  executeMagicVision(action) {
    const hero = this.findHero(action.heroId);
    const MAGIC_VISION_DC = 12;
    const roll = action.roll || this.rollDice(20);
    const intBonus = hero.intellect || 0;
    const total = roll + intBonus;
    const success = total >= MAGIC_VISION_DC;

    if (success) {
      this.gs.runesRevealed = true;
      for (const obj of this.gs.objects) {
        if (obj.type === 'rune') {
          obj.revealed = true;
          obj.discovered = true;
        }
      }
    }

    hero.actionUsed = true;
    this.gs.actionUsed = true;

    this.addLog(`👁 ${hero.name} применяет магическое зрение (d20=${roll}+${intBonus}=${total} DC${MAGIC_VISION_DC}): ${success ? 'руны раскрыты!' : 'ничего не видно'}`, success ? 'log-action' : 'log-damage');

    return {
      type: 'magic-vision',
      heroId: hero.id, heroName: hero.name,
      roll, bonus: intBonus, total, success,
      diceRolls: [{
        diceType: 'd20', roll, bonus: intBonus,
        label: '👁 Магическое зрение',
        message: `${hero.name}: d20 + ИНТ(${intBonus}) ≥ DC${MAGIC_VISION_DC}`,
        success,
        resultText: success
          ? `<span class="dice-result-success">✅ d20=${roll}+${intBonus}=${total} — Руны раскрыты!</span>`
          : `<span class="dice-result-fail">❌ d20=${roll}+${intBonus}=${total} — Зрение затуманено</span>`,
      }],
    };
  }

  // ============================================================
  // FREE ACTION — text processed by AI
  // ============================================================

  executeFreeAction(action) {
    const hero = this.findHero(action.heroId);
    const text = action.text || 'Свободное действие';

    hero.bonusActionUsed = true;
    this.gs.bonusActionUsed = true;

    this.addLog(`📝 ${hero.name}: ${text}`, 'log-action');

    return {
      type: 'free-action',
      heroId: hero.id, heroName: hero.name,
      text,
      needsAI: true,
    };
  }

  // ============================================================
  // TALK — conversation with NPC
  // ============================================================

  executeTalk(action) {
    const hero = this.findHero(action.heroId);
    const npc = this.gs.monsters.find(m => m.id === action.targetId && m.alive);
    if (!npc) return { type: 'talk', success: false, message: 'НПС не найден' };

    const dialog = npc.dialog || npc.greeting || '';
    const name = npc.name || 'НПС';
    const isTrader = npc.isTrader;
    const isQuestNpc = npc.isQuestNpc;

    // Get NPC's shop items if trader
    let shopItems = [];
    if (isTrader && npc.shopItems?.length) {
      shopItems = npc.shopItems;
    }

    // Get dialog tree if exists
    const dialogTree = npc.dialogTree || null;

    this.addLog(`💬 ${hero.name} говорит с ${name}`, 'log-info');

    return {
      type: 'talk',
      heroId: hero.id,
      heroName: hero.name,
      npcId: npc.id,
      npcName: name,
      dialog,
      isTrader,
      isQuestNpc,
      shopItems,
      dialogTree,
      message: `${hero.name} говорит с ${name}`,
    };
  }

  // ============================================================
  // LOOT CHEST — pick specific items or all
  // ============================================================

  executeLootChest(action) {
    const hero = this.findHero(action.heroId);
    const chestId = action.chestId;
    const takeAll = action.takeAll;
    const takeIndices = action.takeIndices || []; // array of item indices to take

    const obj = this.gs.objects.find(o => o.id === chestId);
    if (!obj || !obj.loot) return { type: 'loot-chest', success: false, message: 'Сундук не найден' };

    const loot = obj.loot;
    const takenItems = [];

    if (takeAll) {
      // Take everything
      if (loot.silver) hero.silver = (hero.silver || 0) + loot.silver;
      if (loot.gold) hero.gold = (hero.gold || 0) + loot.gold;
      if (loot.items) {
        loot.items.forEach(item => { hero.inventory.push(item); takenItems.push(item.name); });
      }
      obj.opened = true;
      obj.loot = null;
    } else {
      // Take specific items by index
      const sorted = [...takeIndices].sort((a, b) => b - a); // reverse to safely splice
      sorted.forEach(idx => {
        if (loot.items && loot.items[idx]) {
          const item = loot.items.splice(idx, 1)[0];
          hero.inventory.push(item);
          takenItems.push(item.name);
        }
      });
      // Always take silver/gold
      if (loot.silver) { hero.silver = (hero.silver || 0) + loot.silver; loot.silver = 0; }
      if (loot.gold) { hero.gold = (hero.gold || 0) + loot.gold; loot.gold = 0; }
      // If all items taken, mark chest as fully looted
      if (!loot.items || loot.items.length === 0) {
        obj.opened = true;
        obj.loot = null;
      }
    }

    const msg = takenItems.length > 0 ? `${hero.name} забирает: ${takenItems.join(', ')}` : `${hero.name} забирает серебро`;
    this.addLog(`📦 ${msg}`, 'log-loot');

    return { type: 'loot-chest', heroId: hero.id, heroName: hero.name, takenItems, message: msg };
  }

  // ============================================================
  // VALIDATE & EXECUTE: INTERACT (chests, runes, traps)
  // ============================================================

  validateInteract(hero, action) {
    if (this.gs.bonusActionUsed) return { ok: false, error: 'Доп. действие уже использовано' };
    // Find object by targetId or by coordinates
    let obj;
    if (action.targetId) {
      obj = this.gs.objects.find(o => o.id === action.targetId && !o.opened && !o.triggered && !o.activated);
    }
    if (!obj) {
      const { targetRow, targetCol } = action;
      if (targetRow === undefined || targetCol === undefined) return { ok: false, error: 'Не указана цель' };
      obj = this.gs.objects.find(o => o.row === targetRow && o.col === targetCol && !o.opened && !o.triggered && !o.activated);
    }
    if (!obj) return { ok: false, error: 'Нет объекта для взаимодействия' };
    const dist = Math.abs(hero.row - obj.row) + Math.abs(hero.col - obj.col);
    if (dist > NPC_INTERACT_RANGE) return { ok: false, error: `Объект слишком далеко (макс. ${NPC_INTERACT_RANGE} клетки)` };
    return { ok: true };
  }

  async executeInteract(action) {
    const hero = this.findHero(action.heroId);
    let obj;
    if (action.targetId) obj = this.gs.objects.find(o => o.id === action.targetId && !o.opened && !o.triggered && !o.activated);
    if (!obj) obj = this.gs.objects.find(o => o.row === action.targetRow && o.col === action.targetCol && !o.opened && !o.triggered && !o.activated);
    if (!obj) return { type: 'interact', success: false, message: 'Объект не найден' };

    const result = { type: 'interact', heroId: hero.id, heroName: hero.name, objectType: obj.type, objectId: obj.id };

    switch (obj.type) {
      case 'chest': {
        // Generate loot from weighted tables (async — queries DB for items)
        const lootArray = await LootGenerator.generateChestLoot(obj.chestType || 'normal');
        // Separate currency from items
        const items = [];
        let silver = 0;
        let gold = 0;
        for (const entry of lootArray) {
          if (entry.type === 'currency') {
            if (entry.currency === 'silver') silver += entry.amount;
            else if (entry.currency === 'gold') gold += entry.amount;
          } else {
            items.push(entry);
          }
        }
        const loot = { items, silver, gold };
        obj.loot = loot;
        obj.openedBy = hero.id;
        result.loot = loot;
        result.showChestPopup = true;
        result.chestId = obj.id;
        result.message = `${hero.name} открывает сундук!`;
        this.addLog(`📦 ${result.message}`, 'log-loot');
        break;
      }
      case 'rune': {
        obj.activated = true;
        obj.discovered = true;
        const runeType = obj.runeType || 'wisdom';
        const effects = {
          flame: { stat: 'attack', bonus: 2, msg: 'Руна Пламени! +2 к атаке до конца миссии' },
          ice: { stat: 'armor', bonus: 2, msg: 'Руна Льда! +2 к броне до конца миссии' },
          storm: { stat: 'agility', bonus: 2, msg: 'Руна Шторма! +2 к ловкости до конца миссии' },
          wisdom: { stat: 'intellect', bonus: 2, msg: 'Руна Мудрости! +2 к интеллекту до конца миссии' },
        };
        const eff = effects[runeType] || effects.wisdom;
        hero[eff.stat] = (hero[eff.stat] || 0) + eff.bonus;
        result.message = `${hero.name} активирует ${obj.name || 'руну'}! ${eff.msg}`;
        this.addLog(`🔮 ${result.message}`, 'log-loot');
        break;
      }
      case 'trap': {
        obj.triggered = true;
        obj.discovered = true;
        // Disarm check: d20 + agility vs DC 12
        const roll = this.rollDice(20);
        const dc = TRAP_DISARM_DC;
        const bonus = hero.agility || 0;
        const total = roll + bonus;
        const success = total >= dc;
        if (success) {
          result.disarmed = true;
          result.message = `${hero.name} обезвреживает ловушку!`;
          this.addLog(`🪤 ${result.message} (d20=${roll}+${bonus}=${total} ≥ ${dc})`, 'log-action');
        } else {
          const dmg = obj.trapType === 'rift' ? 15 : obj.trapType === 'snare' ? 8 : 4;
          hero.hp = Math.max(0, hero.hp - dmg);
          result.disarmed = false;
          result.damage = dmg;
          result.message = `${hero.name} активирует ловушку! ${dmg} урона`;
          this.addLog(`⚡ ${result.message} (d20=${roll}+${bonus}=${total} < ${dc})`, 'log-damage');
          if (hero.hp <= 0) { hero.alive = false; this.addLog(`${hero.name} погибает!`, 'log-kill'); }
        }
        result.diceRolls = [{ diceType: 'd20', roll, bonus, label: '🪤 Ловушка', message: `Обезвреживание: d20+ЛОВ ≥ ${dc}`, success, resultText: success ? `<span class="dice-result-success">✅ d20=${roll}+${bonus}=${total} ≥ ${dc} — Обезврежена!</span>` : `<span class="dice-result-fail">❌ d20=${roll}+${bonus}=${total} < ${dc} — Ловушка сработала!</span>` }];
        break;
      }
      default:
        result.message = 'Неизвестный объект';
    }

    // Mark bonus action used
    this.gs.bonusActionUsed = true;
    hero.bonusActionUsed = true;

    return result;
  }

  // ============================================================
  // EXECUTE: END TURN
  // ============================================================

  executeEndTurn() {
    // Explore mode: advance hero index, reset turn state
    if (this.gs.mode === 'explore' || !this.gs.turnOrder?.length) {
      const currentHero = this.gs.heroes[this.gs.activeHeroIdx || 0];
      if (currentHero) {
        currentHero.moveUsed = false;
        currentHero.actionUsed = false;
        currentHero.bonusActionUsed = false;
        currentHero.stepsRemaining = currentHero.moveRange || BASE_MOVE_RANGE;
      }
      this.gs.activeHeroIdx = ((this.gs.activeHeroIdx || 0) + 1) % this.gs.heroes.length;
      this.gs.round = (this.gs.round || 0) + 1;
      this.gs.moveUsed = false;
      this.gs.actionUsed = false;
      this.gs.bonusActionUsed = false;

      // Reset next hero
      const nextHero = this.gs.heroes[this.gs.activeHeroIdx];
      if (nextHero) {
        nextHero.stepsRemaining = nextHero.moveRange || BASE_MOVE_RANGE;
      }

      return { type: 'end-turn', round: this.gs.round, mode: 'explore' };
    }

    // Combat mode
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
            this._checkFireZone(mon);
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
            this._checkFireZone(mon);
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

    // Calculate combat zone (Chebyshev COMBAT_ZONE_RANGE from each monster)
    this.gs.combatZone = this.calculateCombatZone(aggroMonsters);

    // Determine combat heroes — all within COMBAT_JOIN_RANGE of any aggro monster
    this.gs.combatHeroes = this.gs.heroes
      .filter(h => h.hp > 0 && !h.dead && !h.leftGame &&
        aggroMonsters.some(m => chebyshevDist(h.row, h.col, m.row, m.col) <= COMBAT_JOIN_RANGE))
      .map(h => h.id);

    // Roll initiative
    const participants = [];

    this.gs.heroes.forEach(h => {
      if (this.gs.combatHeroes.includes(h.id)) {
        const agilityBonus = h.agility || 3;
        const surpriseBonus = h.surpriseAttack ? SURPRISE_INITIATIVE_BONUS : 0;
        const roll = this.rollDice(6);
        participants.push({
          entityId: h.id, type: 'hero',
          initiative: agilityBonus + surpriseBonus + roll, roll,
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

    // Distribute rewards on victory
    const rewards = { xp: 0, silver: 0, gold: 0, items: [] };
    if (result === 'victory') {
      // LootGenerator required at top of file
      const aliveHeroes = this.gs.heroes.filter(h => h.hp > 0 && h.alive !== false);
      const killedMonsters = this.gs.monsters.filter(m => m.hp <= 0 && !m.friendly);

      // XP from killed monsters
      let totalXp = 0;
      let totalSilver = 0;
      killedMonsters.forEach(m => {
        totalXp += m.xpReward || DEFAULT_XP_REWARD;
        totalSilver += (m.goldMin || DEFAULT_GOLD_MIN) + Math.floor(Math.random() * ((m.goldMax || DEFAULT_GOLD_MAX) - (m.goldMin || DEFAULT_GOLD_MIN)));
      });

      // Distribute evenly among alive heroes
      const xpPerHero = Math.ceil(totalXp / Math.max(1, aliveHeroes.length));
      const silverPerHero = Math.ceil(totalSilver / Math.max(1, aliveHeroes.length));
      aliveHeroes.forEach(h => {
        h.xp = (h.xp || 0) + xpPerHero;
        h.silver = (h.silver || 0) + silverPerHero;
      });

      // Generate monster loot
      killedMonsters.forEach(m => {
        const lootTier = m.isBoss ? 'boss' : (m.hp >= ELITE_HP_THRESHOLD ? 'elite' : 'common');
        const loot = LootGenerator.generateMonsterLoot ? LootGenerator.generateMonsterLoot(lootTier) : null;
        if (loot?.items?.length && aliveHeroes.length > 0) {
          const recipient = aliveHeroes[Math.floor(Math.random() * aliveHeroes.length)];
          loot.items.forEach(item => recipient.inventory.push(item));
          rewards.items.push(...loot.items);
        }
      });

      rewards.xp = xpPerHero;
      rewards.silver = silverPerHero;
      this.addLog(`🏆 Победа! +${xpPerHero} XP, +${silverPerHero} серебра${rewards.items.length ? ', ' + rewards.items.map(i => i.name).join(', ') : ''}`, 'log-loot');
    }

    this.addLog(result === 'victory'
      ? 'Бой окончен! Все враги повержены.'
      : 'Бой окончен. Герои пали...', 'log-discovery');

    return {
      type: 'combat_ended',
      result,
      summary,
      rewards,
      matchStats: this.gs.matchStats,
    };
  }

  checkAggroAfterMove(hero) {
    // Stealth heroes don't trigger aggro (unless adjacent)
    const stealthRange = hasStatus(hero, 'stealth') ? 1 : AGGRO_RANGE;
    const newlyAggro = [];
    for (const mon of this.gs.monsters) {
      if (mon.hp <= 0 || mon.fled || mon.aggro || mon.friendly) continue;
      const dist = chebyshevDist(mon.row, mon.col, hero.row, hero.col);
      if (dist <= stealthRange) {
        mon.aggro = true;
        mon.discovered = true;
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
    let baseRange = entity.moveRange || BASE_MOVE_RANGE;

    // Status reductions (frozen, slowed)
    const reduction = getMoveReduction(entity);
    if (reduction > 0) baseRange = Math.max(0, baseRange - reduction);

    // Status bonus (haste)
    const bonus = getMoveBonus(entity);
    if (bonus > 0) baseRange += bonus;

    // Rooted — no movement
    if (hasModifier(entity, 'blockMovement')) return 0;

    return baseRange;
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
        reachable.push({ row, col, cost });
      }
      if (cost >= range) continue;

      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of neighbors) {
        const nr = row + dr;
        const nc = col + dc;
        if (!this.isValidCell(nr, nc)) continue;
        if (this.gs.map[nr][nc] === 'wall') continue;
        if (this.hasBlockingObject(nr, nc)) continue;

        // Obstacle cells cost 2 steps
        const cellType = this.gs.map[nr][nc];
        const stepCost = (cellType === 'obstacle') ? 2 : 1;
        const newCost = cost + stepCost;
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

        // Obstacle cells cost 2 steps instead of 1
        const cellType = this.gs.map[nr][nc];
        const stepCost = (cellType === 'obstacle' || cellType === 2) ? 2 : 1;
        const g = current.g + stepCost;
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

  _updateFogForHero(hero) {
    if (!this.gs.fog || !hero) return;
    const totalRadius = FULL_VISION_RADIUS + PARTIAL_VISION_RADIUS;
    const ROWS = this.gs.map.length;
    const COLS = this.gs.map[0]?.length || 0;

    // Downgrade previous visible to explored — never back to hidden
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.gs.fog[r][c] === FOG_VISIBLE) this.gs.fog[r][c] = FOG_EXPLORED;
      }
    }

    // Reveal around ALL alive heroes
    for (const h of this.gs.heroes) {
      if (!h.alive && h.hp <= 0) continue;
      for (let r = h.row - totalRadius; r <= h.row + totalRadius; r++) {
        for (let c = h.col - totalRadius; c <= h.col + totalRadius; c++) {
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
          const dist = Math.abs(r - h.row) + Math.abs(c - h.col);
          if (dist <= FULL_VISION_RADIUS) {
            this.gs.fog[r][c] = FOG_VISIBLE;
            this.gs.monsters.forEach(m => {
              if (m.row === r && m.col === c && m.alive) m.discovered = true;
            });
          } else if (dist <= totalRadius && this.gs.fog[r][c] < FOG_EXPLORED) {
            this.gs.fog[r][c] = FOG_EXPLORED;
          }
        }
      }
    }
  }

  /**
   * Check hazardous terrain (fire, water) after entity moves
   * Returns events array for client popups
   */
  _checkHazardousTerrain(entity) {
    if (!entity || !entity.alive) return [];
    const cellVal = this.gs.map?.[entity.row]?.[entity.col];
    const events = [];

    // Fire zone: apply burning (2 HP/turn for 3 turns)
    if (cellVal === 4 || cellVal === 'fire') {
      const hasBurning = (entity.statusEffects || []).find(e => e.type === 'burning');
      if (!hasBurning) {
        applyStatus(entity, 'burning', { damagePerTurn: BURNING_DAMAGE, duration: BURNING_DURATION });
        this.addLog(`${entity.name} попадает в огненную зону! 🔥 Горение на 3 хода (2 HP/ход)`, 'log-damage');
        events.push({ type: 'fire', entityId: entity.id, entityName: entity.name });
      }
    }

    // Water zone: drowning check d20
    if (cellVal === 3 || cellVal === 'water') {
      events.push({
        type: 'water_check',
        entityId: entity.id,
        entityName: entity.name,
        diceType: 'd20',
        dc: 10,
        message: `${entity.name} попадает в воду! Проверка утопления (d20 ≥ 10)`,
      });
    }

    return events;
  }

  /**
   * Process water check result (called from client after dice roll)
   */
  processWaterCheck(entityId, diceRoll) {
    const entity = this.gs.heroes.find(h => h.id === entityId) ||
                   this.gs.monsters.find(m => m.id === entityId);
    if (!entity || !entity.alive) return { success: false };

    const dc = 10;
    const success = diceRoll >= dc;

    if (success) {
      this.addLog(`${entity.name} бросает ${diceRoll} — успешно переплывает! ✅`, 'log-action');
      return { success: true, roll: diceRoll, dc, message: `${entity.name} переплывает (${diceRoll} ≥ ${dc})` };
    } else {
      // Failed: take damage and possibly drown
      const dmg = Math.max(1, Math.floor(dc - diceRoll));
      entity.hp = Math.max(0, entity.hp - dmg);
      this.addLog(`${entity.name} бросает ${diceRoll} — тонет! Урон ${dmg} HP 💀`, 'log-damage');
      if (entity.hp <= 0) {
        entity.alive = false;
        this.addLog(`${entity.name} утонул!`, 'log-kill');
      }
      return { success: false, roll: diceRoll, dc, damage: dmg, message: `${entity.name} тонет! (${diceRoll} < ${dc}) Урон: ${dmg}` };
    }
  }

  // Legacy alias
  _checkFireZone(entity) {
    this._checkHazardousTerrain(entity);
  }

  addLog(message, type = 'log-action') {
    this.actionLog.push({ message, type, timestamp: Date.now() });
  }

  getActionLog() {
    const log = [...this.actionLog];
    this.actionLog = [];
    return log;
  }
}

// ============================================================
// CELL TYPE CONSTANTS (matching design repo app.js)
// ============================================================
const CELL_TYPES = { FLOOR: 0, WALL: 1, HERO: 2, MONSTER: 3, CHEST: 4, TRAP: 5, RUNE: 6 };
// 7 = talkable monster, 8 = stash guard, 9 = boss, 11 = hidden chest, 12 = friendly NPC

const TERRAIN_WATER = 2;
const FOG_UNKNOWN = 0;

const RUNE_TYPES = {
  flame:  { id: 'flame',  name: 'Руна Пламени',  label: '🔥' },
  ice:    { id: 'ice',    name: 'Руна Льда',      label: '❄️' },
  storm:  { id: 'storm',  name: 'Руна Шторма',    label: '⚡' },
  wisdom: { id: 'wisdom', name: 'Руна Мудрости',  label: '📖' },
};
const RUNE_TYPE_KEYS = Object.keys(RUNE_TYPES);

const TRAP_TYPES = {
  snare: { id: 'snare', name: 'Капкан',  label: '🪤', dmg: 8,  status: 'snare', statusDuration: 1 },
  rift:  { id: 'rift',  name: 'Разлом',  label: '🕳️', dmg: 15, status: 'stun',  statusDuration: 1 },
  swamp: { id: 'swamp', name: 'Трясина', label: '🌿', dmg: 4,  status: 'swamp', statusDuration: 2, dot: 3 },
};
const TRAP_TYPE_KEYS = Object.keys(TRAP_TYPES);

const CLASS_BASE_STATS = {
  warrior: { label: 'W', color: '#d4a030', moveRange: 4, vision: 4, attack: 5, agility: 3, armor: 4, intellect: 2, wisdom: 2, charisma: 3, hp: 30, maxHp: 30, mp: 20, maxMp: 20, spells: [] },
  mage:    { label: 'M', color: '#5a7fcc', moveRange: 3, vision: 5, attack: 3, agility: 5, armor: 1, intellect: 6, wisdom: 4, charisma: 3, hp: 20, maxHp: 20, mp: 30, maxMp: 30, spells: ['resurrection'] },
  priest:  { label: 'P', color: '#8fbc8f', moveRange: 3, vision: 4, attack: 2, agility: 4, armor: 2, intellect: 4, wisdom: 6, charisma: 5, hp: 30, maxHp: 30, mp: 40, maxMp: 40, spells: [] },
  bard:    { label: 'B', color: '#c77dba', moveRange: 4, vision: 4, attack: 3, agility: 4, armor: 2, intellect: 4, wisdom: 3, charisma: 6, hp: 25, maxHp: 25, mp: 30, maxMp: 30, spells: [] },
};

const RACE_PASSIVES = {
  human: ['passive_human_1', 'passive_human_2'],
  elf: ['passive_elf_1', 'passive_elf_2', 'passive_elf_3'],
  dwarf: ['passive_dwarf_1', 'passive_dwarf_2', 'passive_dwarf_3'],
};
const CLASS_BASE_ABILITIES = {
  warrior: ['base_warrior_1', 'base_warrior_2', 'base_warrior_3'],
  mage: ['base_mage_1', 'base_mage_2', 'base_mage_3'],
  priest: [],
  bard: ['base_bard_1', 'base_bard_2', 'base_bard_3'],
};

// ============================================================
// STATIC: Initialize game state from DB
// ============================================================

/**
 * Build a complete game state from database models.
 * Called by gameHandler.js when starting/joining a game.
 * @param {Object} session - GameSession document (with players array)
 * @returns {Object} gameState ready for GameEngine constructor
 */
GameEngine.initializeFromDB = async function (session) {
  const Scenario = require('../models/Scenario');
  const GameMap = require('../models/GameMap');
  const Hero = require('../models/Hero');
  const MonsterTemplate = require('../models/MonsterTemplate');

  // 1. Load scenario
  const scenario = await Scenario.findOne({ scenarioId: session.scenarioId, active: true }).lean();
  if (!scenario) throw new Error(`Сценарий не найден: ${session.scenarioId}`);

  // 2. Load map
  const gameMap = await GameMap.findOne({ mapId: scenario.mapId, active: true }).lean();
  if (!gameMap) throw new Error(`Карта не найдена: ${scenario.mapId}`);

  if (!gameMap.mapData || !gameMap.mapData.length) {
    throw new Error(`Карта ${scenario.mapId} не содержит данных`);
  }

  // 3. Load heroes for all session players
  const heroIds = session.players.map(p => p.heroId).filter(Boolean);
  const heroDocuments = heroIds.length > 0
    ? await Hero.find({ _id: { $in: heroIds } }).lean()
    : [];

  // Build player→hero map with ownership
  const playerHeroes = session.players.map(p => {
    const heroDoc = heroDocuments.find(h => h._id.toString() === (p.heroId || '').toString());
    return {
      playerId: p.userId.toString(),
      displayName: p.displayName,
      hero: heroDoc || null,
    };
  }).filter(ph => ph.hero);

  // 4. Load monster templates
  const monsterTemplates = await MonsterTemplate.find({ active: true }).lean();
  const findMonsterDef = (type) => monsterTemplates.find(m => m.type === type);

  // 5. Parse map and build game state
  const mapData = gameMap.mapData;
  const roadMap = gameMap.roadMap || [];
  const ROWS = mapData.length;
  const COLS = mapData[0] ? mapData[0].length : 1;

  const gs = {
    initialized: true,
    map: [],
    fog: [],
    terrain: [],
    heroes: [],
    monsters: [],
    objects: [],
    npcs: [],
    mode: 'explore',
    round: 1,
    activeHeroIdx: 0,
    turnOrder: [],
    currentTurnIdx: 0,
    combatMonsters: [],
    combatZone: [],
    combatHeroes: [],
    moveUsed: false,
    actionUsed: false,
    bonusActionUsed: false,
    mapWidth: COLS,
    mapHeight: ROWS,
    bgImage: gameMap.bgImage || '',
    scenarioName: scenario.name || '',
    scenarioDescription: scenario.description || '',
    introNarration: scenario.introNarration || '',
    briefing: scenario.briefing || {},
    objectives: scenario.objectives || {},
    matchStats: {},
    mission: {
      objectivesCompleted: [],
      tradersAlive: 0,
      tradersTotal: 0,
      goblinsDefeated: 0,
      goblinsTotal: 0,
      stashFound: false,
      mainComplete: false,
      bonusComplete: false,
    },
    currentScenario: session.scenarioId,
  };

  let monsterIdx = 0;

  // ── Parse map grid ──
  // Admin panel mapData format: 0=floor, 1=wall, 2=obstacle(slower), 3=water, 4=fire
  // All entities (monsters, NPCs, chests, traps, runes) come from scenario zones
  for (let r = 0; r < ROWS; r++) {
    gs.map[r] = [];
    gs.fog[r] = [];
    gs.terrain[r] = [];
    for (let c = 0; c < COLS; c++) {
      const t = mapData[r][c];
      gs.fog[r][c] = FOG_HIDDEN;

      // Map cell type from admin:
      // 0 = floor (fully walkable)
      // 1 = wall (impassable, always visible)
      // 2 = obstacle (walkable but costs extra step)
      // 3 = water (walkable but dangerous — drowning check)
      // 4 = fire (walkable but applies burning)
      if (t === 1) {
        gs.map[r][c] = 'wall';
      } else if (t === 2) {
        gs.map[r][c] = 'obstacle';
      } else if (t === 3) {
        gs.map[r][c] = 'water';
      } else if (t === 4) {
        gs.map[r][c] = 'fire';
      } else {
        gs.map[r][c] = 'floor';
      }

      // Terrain from roadMap (overlay layer)
      const terrainVal = roadMap[r] && roadMap[r][c];
      if (terrainVal === 'road' || terrainVal === 1) gs.terrain[r][c] = 'road';
      else if (terrainVal === 'offroad' || terrainVal === 2) gs.terrain[r][c] = 'offroad';
      else gs.terrain[r][c] = 'offroad';
    }
  }

  // ── Spawn monsters from scenario monsterPool with explicit positions ──
  if (scenario.monsterPool) {
    for (const poolEntry of scenario.monsterPool) {
      const type = typeof poolEntry === 'string' ? poolEntry : poolEntry?.type;
      const positions = typeof poolEntry === 'object' ? poolEntry?.positions : null;
      if (!type) continue;
      const def = findMonsterDef(type);
      if (!def) continue;

      if (positions && positions.length > 0) {
        for (const pos of positions) {
          const row = pos.y ?? pos.row ?? 0;
          const col = pos.x ?? pos.col ?? 0;
          // Don't duplicate if already spawned from map cell type 3
          const alreadySpawned = gs.monsters.some(m => m.row === row && m.col === col);
          if (!alreadySpawned) {
            gs.monsters.push(_spawnMonster(def, monsterIdx, row, col, scenario.monsterOverrides));
            monsterIdx++;
          }
        }
      }
    }
  }

  // ── Load all friendly NPC definitions from DB ──
  const FriendlyNpc = require('../models/FriendlyNpc');
  const allFriendlyNpcs = await FriendlyNpc.find({ active: true }).lean();
  const npcLookup = {};
  allFriendlyNpcs.forEach(n => { npcLookup[n.npcId] = n; if (n.name) npcLookup[n.name] = n; });

  // ── Spawn friendly NPCs from scenario (deduplicate with traders) ──
  const spawnedNpcKeys = new Set();
  if (scenario.friendlyNpcs && scenario.friendlyNpcs.length > 0) {
    scenario.friendlyNpcs.forEach((npcDef, idx) => {
      const row = npcDef.y ?? npcDef.row ?? 0;
      const col = npcDef.x ?? npcDef.col ?? 0;
      const key = `${row},${col}`;
      if (spawnedNpcKeys.has(key)) return;
      spawnedNpcKeys.add(key);
      // Look up full NPC definition from DB
      const dbNpc = npcLookup[npcDef.npcId] || npcLookup[npcDef.name] || {};
      const npc = {
        id: `npc-${idx}`,
        type: dbNpc.npcId || npcDef.type || 'npc',
        name: dbNpc.name || npcDef.name || 'NPC',
        label: dbNpc.label || npcDef.label || '🧝',
        row, col,
        hp: dbNpc.hp || npcDef.hp || DEFAULT_NPC_HP,
        maxHp: dbNpc.hp || npcDef.hp || DEFAULT_NPC_HP,
        armor: dbNpc.armor || 0, attack: dbNpc.attack || 0, agility: dbNpc.agility || 3,
        moveRange: 0, vision: 6, attackRange: 0,
        canTalk: dbNpc.canTalk !== undefined ? dbNpc.canTalk : true,
        friendly: true,
        isTrader: dbNpc.isTrader || false,
        isQuestNpc: dbNpc.isQuestNpc || false,
        tokenImg: dbNpc.iconImg || dbNpc.tokenImg || '',
        hoverImg: dbNpc.hoverImg || dbNpc.iconImg || '',
        greeting: dbNpc.greeting || npcDef.dialog || '',
        dialog: dbNpc.greeting || npcDef.dialog || '',
        dialogTree: dbNpc.dialogTree || [],
        description: dbNpc.description || '',
        alive: true, aggro: false, discovered: false,
        dialogState: 'greeting', statusEffects: [],
      };
      gs.monsters.push(npc);
    });
  }

  // ── Spawn traders from scenario (deduplicate with friendlyNpcs) ──
  let traderCount = 0;
  if (scenario.traders && scenario.traders.length > 0) {
    scenario.traders.forEach((trader, idx) => {
      const row = trader.y ?? trader.row ?? 0;
      const col = trader.x ?? trader.col ?? 0;
      const key = `${row},${col}`;
      if (spawnedNpcKeys.has(key)) return;
      spawnedNpcKeys.add(key);
      traderCount++;
      const dbNpc = npcLookup[trader.npcId] || npcLookup[trader.name] || {};
      const traderMon = {
        id: `trader-${idx}`,
        type: 'trader',
        name: dbNpc.name || trader.name || 'Торговец',
        label: dbNpc.label || trader.label || '🧝',
        row, col,
        hp: dbNpc.hp || trader.hp || DEFAULT_TRADER_HP,
        maxHp: dbNpc.hp || trader.hp || DEFAULT_TRADER_HP,
        armor: 0, attack: 0, agility: 2,
        moveRange: 0, vision: 3, attackRange: 0,
        canTalk: true, friendly: true, isTrader: true,
        tokenImg: dbNpc.iconImg || dbNpc.tokenImg || '',
        hoverImg: dbNpc.hoverImg || dbNpc.iconImg || '',
        greeting: dbNpc.greeting || '',
        dialog: dbNpc.greeting || '',
        dialogTree: dbNpc.dialogTree || [],
        alive: true, aggro: false, discovered: false,
        dialogState: 'greeting', statusEffects: [],
      };
      gs.monsters.push(traderMon);
    });
    gs.mission.tradersTotal = traderCount;
    gs.mission.tradersAlive = traderCount;
  }

  // ── Spawn objects from scenario zones ──
  const zones = scenario.zones || {};

  // Chests from zones
  if (zones.chests && zones.chests.length > 0) {
    zones.chests.forEach((ch, idx) => {
      const row = ch.y ?? ch.row ?? 0;
      const col = ch.x ?? ch.col ?? 0;
      if (!gs.objects.some(o => o.row === row && o.col === col)) {
        gs.objects.push({ type: 'chest', label: '♦', row, col, opened: false, discovered: true, id: `obj-zchest-${idx}` });
      }
    });
  }

  // Traps from zones
  if (zones.traps && zones.traps.length > 0) {
    zones.traps.forEach((tr, idx) => {
      const row = tr.y ?? tr.row ?? 0;
      const col = tr.x ?? tr.col ?? 0;
      if (!gs.objects.some(o => o.row === row && o.col === col)) {
        const tt = TRAP_TYPES[TRAP_TYPE_KEYS[idx % TRAP_TYPE_KEYS.length]];
        gs.objects.push({ type: 'trap', trapType: tt.id, label: tt.label, name: tt.name, row, col, hidden: true, discovered: false, triggered: false, id: `obj-ztrap-${idx}` });
      }
    });
  }

  // Runes from zones
  if (zones.runes && zones.runes.length > 0) {
    zones.runes.forEach((ru, idx) => {
      const row = ru.y ?? ru.row ?? 0;
      const col = ru.x ?? ru.col ?? 0;
      if (!gs.objects.some(o => o.row === row && o.col === col)) {
        const rt = RUNE_TYPES[RUNE_TYPE_KEYS[idx % RUNE_TYPE_KEYS.length]];
        gs.objects.push({ type: 'rune', runeType: rt.id, label: rt.label, name: rt.name, row, col, activated: false, hidden: true, discovered: false, id: `obj-zrune-${idx}` });
      }
    });
  }

  // Quest NPCs from zones
  if (zones.questNpcs && zones.questNpcs.length > 0) {
    zones.questNpcs.forEach((qn, idx) => {
      const row = qn.y ?? qn.row ?? 0;
      const col = qn.x ?? qn.col ?? 0;
      const key = `${row},${col}`;
      if (!spawnedNpcKeys.has(key)) {
        spawnedNpcKeys.add(key);
        const dbNpc = npcLookup[qn.npcId] || npcLookup[qn.name] || {};
        gs.monsters.push({
          id: `quest-npc-${idx}`,
          type: 'quest-npc',
          name: dbNpc.name || qn.name || 'NPC',
          label: dbNpc.label || qn.label || '❗',
          row, col,
          hp: dbNpc.hp || qn.hp || DEFAULT_QUEST_NPC_HP,
          maxHp: dbNpc.hp || qn.hp || DEFAULT_QUEST_NPC_HP,
          armor: 0, attack: 0, agility: 2,
          moveRange: 0, vision: 4, attackRange: 0,
          canTalk: true, friendly: true, isQuestNpc: true,
          tokenImg: dbNpc.iconImg || dbNpc.tokenImg || '',
          hoverImg: dbNpc.hoverImg || dbNpc.iconImg || '',
          greeting: dbNpc.greeting || qn.dialog || '',
          dialog: dbNpc.greeting || qn.dialog || '',
          dialogTree: dbNpc.dialogTree || [],
          alive: true, aggro: false, discovered: false,
          dialogState: 'greeting', statusEffects: [],
        });
      }
    });
  }

  // ── Spawn heroes at startZone positions or fallback ──
  const startZone = zones.startZone || [];
  for (let i = 0; i < playerHeroes.length; i++) {
    const ph = playerHeroes[i];
    let pos;
    if (startZone[i]) {
      pos = { row: startZone[i].y ?? startZone[i].row ?? 0, col: startZone[i].x ?? startZone[i].col ?? 0 };
    } else {
      // Fallback: find free floor cells
      const fallbacks = _findHeroStartPositions(gs, ROWS, COLS, playerHeroes.length - i);
      pos = fallbacks[0] || { row: 0, col: 0 };
    }
    const hero = _buildHero(ph.hero, ph.playerId, pos.row, pos.col);
    gs.heroes.push(hero);
  }

  // Count goblins for mission tracking
  gs.mission.goblinsTotal = gs.monsters.filter(m =>
    ['goblin', 'goblin-scout', 'goblin-warrior', 'goblin-archer', 'goblin-chief'].includes(m.type)
  ).length;

  // Spawn bonus content (additional chests, runes, traps on free cells)
  _spawnBonusContent(gs, ROWS, COLS);

  // Compute initial fog of war (reveal around heroes)
  _computeInitialFog(gs, ROWS, COLS);

  // Set first hero's turn state
  if (gs.heroes.length > 0) {
    const firstHero = gs.heroes[0];
    firstHero.stepsRemaining = firstHero.moveRange || BASE_MOVE_RANGE;
  }

  return gs;
};

// ── Helper: build hero object from DB document ──
function _buildHero(heroDoc, ownerId, row, col) {
  const base = CLASS_BASE_STATS[heroDoc.cls] || CLASS_BASE_STATS.warrior;
  const hero = {
    id: heroDoc._id.toString(),
    _serverId: heroDoc._id.toString(),
    _ownerId: ownerId,
    userId: ownerId,
    name: heroDoc.name,
    cls: heroDoc.cls,
    race: heroDoc.race || 'human',
    gender: heroDoc.gender || 'male',
    label: base.label,
    color: base.color,
    moveRange: heroDoc.moveRange ?? base.moveRange,
    vision: heroDoc.vision ?? base.vision,
    attack: heroDoc.attack ?? base.attack,
    agility: heroDoc.agility ?? base.agility,
    armor: heroDoc.armor ?? base.armor,
    hp: heroDoc.maxHp ?? base.maxHp,
    maxHp: heroDoc.maxHp ?? base.maxHp,
    mp: heroDoc.maxMp ?? base.maxMp,
    maxMp: heroDoc.maxMp ?? base.maxMp,
    intellect: heroDoc.intellect ?? base.intellect,
    wisdom: heroDoc.wisdom ?? base.wisdom,
    charisma: heroDoc.charisma ?? base.charisma,
    level: heroDoc.level || 1,
    xp: heroDoc.xp || 0,
    gold: heroDoc.gold || 0,
    silver: heroDoc.silver || 0,
    spells: heroDoc.spells?.length > 0 ? [...heroDoc.spells] : [...(base.spells || [])],
    row, col,
    alive: true,
    dead: false,
    stealth: 0,
    surpriseAttack: false,
    stepsRemaining: heroDoc.moveRange ?? base.moveRange,
    moveUsed: false,
    actionUsed: false,
    bonusActionUsed: false,
    statusEffects: [],
    runeBuffs: [],
    missionCompletions: heroDoc.missionCompletions || 0,
    tradePoints: heroDoc.tradePoints || 0,
    skillPoints: heroDoc.skillPoints || 0,
    unlockedAbilities: heroDoc.unlockedAbilities || [],
    abilities: heroDoc.abilities || [],
    learnedAbilities: heroDoc.learnedAbilities || [],
    baseAbilities: heroDoc.baseAbilities || [],
    equipment: heroDoc.equipment && Object.keys(heroDoc.equipment).some(k => heroDoc.equipment[k])
      ? JSON.parse(JSON.stringify(heroDoc.equipment))
      : {},
    inventory: heroDoc.inventory ? JSON.parse(JSON.stringify(heroDoc.inventory)) : [],
  };

  // Ensure baseAbilities are populated
  if (!hero.baseAbilities || hero.baseAbilities.length === 0) {
    hero.baseAbilities = [
      ...(RACE_PASSIVES[hero.race] || []),
      ...(CLASS_BASE_ABILITIES[hero.cls] || []),
    ];
  }

  // Apply racial passive bonuses
  if (hero.baseAbilities.includes('passive_dwarf_2')) {
    hero.maxHp += 5;
    hero.hp = Math.min(hero.hp + 5, hero.maxHp);
  }
  if (hero.baseAbilities.includes('passive_elf_1')) {
    hero.vision = (hero.vision || 4) + 1;
  }

  return hero;
}

// ── Helper: spawn monster from MonsterTemplate ──
function _spawnMonster(def, idx, row, col, overrides) {
  const mon = {
    id: `monster-${idx}`,
    type: def.type,
    name: def.name || def.type,
    label: def.label || '👹',
    row, col,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor || 0,
    attack: def.attack || 1,
    agility: def.agility || 0,
    moveRange: def.moveRange || 2,
    vision: def.vision || 4,
    attackRange: def.attackRange || 1,
    damageDie: def.damageDie || 'd6',
    xpReward: def.xpReward || 10,
    goldMin: def.goldMin || 0,
    goldMax: def.goldMax || 5,
    aiType: def.aiType || 'aggressive',
    abilities: def.abilities || [],
    canTalk: def.canTalk || false,
    tokenImg: def.tokenImg || '',
    hoverImg: def.hoverImg || def.tokenImg || '',
    img: def.img || '',
    alive: true,
    aggro: false,
    discovered: false,
    fled: false,
    statusEffects: [],
    runeBuffs: [],
    shieldBlockActive: false,
    shieldBlockCooldown: 0,
  };

  // Apply scenario overrides
  if (overrides && overrides[def.type]) {
    const ov = overrides[def.type];
    if (ov.hp != null) { mon.hp = ov.hp; mon.maxHp = ov.hp; }
    if (ov.armor != null) mon.armor = ov.armor;
    if (ov.attack != null) mon.attack = ov.attack;
    if (ov.agility != null) mon.agility = ov.agility;
    if (ov.damageDie) mon.damageDie = ov.damageDie;
    if (ov.xpReward) mon.xpReward = ov.xpReward;
  }

  return mon;
}

// ── Helper: find starting positions for heroes ──
function _findHeroStartPositions(gs, ROWS, COLS, count) {
  const positions = [];
  const occupied = new Set();

  // Mark occupied cells
  gs.monsters.forEach(m => occupied.add(`${m.row},${m.col}`));
  gs.objects.forEach(o => occupied.add(`${o.row},${o.col}`));

  // Scan from bottom-left for walkable floor cells (heroes typically start at edges)
  for (let r = ROWS - 1; r >= 0 && positions.length < count; r--) {
    for (let c = 0; c < COLS && positions.length < count; c++) {
      if (gs.map[r][c] === 'floor' && !occupied.has(`${r},${c}`)) {
        positions.push({ row: r, col: c });
        occupied.add(`${r},${c}`);
      }
    }
  }

  // Fallback if not enough positions found
  while (positions.length < count) {
    positions.push({ row: 0, col: positions.length });
  }

  return positions;
}

// ── Helper: spawn bonus content on free cells ──
function _spawnBonusContent(gs, ROWS, COLS) {
  const freeCells = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (gs.map[r][c] !== 'floor') continue;
      if (gs.objects.some(o => o.row === r && o.col === c)) continue;
      if (gs.monsters.some(m => m.row === r && m.col === c)) continue;
      if (gs.heroes.some(h => h.row === r && h.col === c)) continue;
      freeCells.push({ r, c });
    }
  }

  function pickCell() {
    if (freeCells.length === 0) return null;
    const idx = Math.floor(Math.random() * freeCells.length);
    return freeCells.splice(idx, 1)[0];
  }

  // Additional runes (2-3)
  const numRunes = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numRunes && freeCells.length > 2; i++) {
    const cell = pickCell();
    if (!cell) break;
    const rt = RUNE_TYPES[RUNE_TYPE_KEYS[i % RUNE_TYPE_KEYS.length]];
    gs.objects.push({
      type: 'rune', runeType: rt.id, label: rt.label, name: rt.name,
      row: cell.r, col: cell.c, activated: false, hidden: true, discovered: false,
      id: `obj-brune-${cell.r}-${cell.c}`,
    });
  }

  // Additional chests (2-3)
  const numChests = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numChests && freeCells.length > 0; i++) {
    const cell = pickCell();
    if (!cell) break;
    gs.objects.push({
      type: 'chest', label: '♦', row: cell.r, col: cell.c,
      opened: false, chestType: 'normal', discovered: true,
      id: `obj-bchest-${cell.r}-${cell.c}`,
    });
  }
}

// ── Helper: compute initial fog of war ──
function _computeInitialFog(gs, ROWS, COLS) {
  const totalRadius = FULL_VISION_RADIUS + PARTIAL_VISION_RADIUS;

  for (const hero of gs.heroes) {
    for (let r = hero.row - totalRadius; r <= hero.row + totalRadius; r++) {
      for (let c = hero.col - totalRadius; c <= hero.col + totalRadius; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        const dist = Math.abs(r - hero.row) + Math.abs(c - hero.col);
        if (dist <= FULL_VISION_RADIUS) {
          gs.fog[r][c] = FOG_VISIBLE;
          gs.monsters.forEach(m => {
            if (m.row === r && m.col === c) m.discovered = true;
          });
        } else if (dist <= totalRadius) {
          gs.fog[r][c] = FOG_EXPLORED;
        }
      }
    }
  }
}

module.exports = GameEngine;
