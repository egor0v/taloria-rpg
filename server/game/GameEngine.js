/**
 * GameEngine — Core game logic for Taloria RPG
 * Built from game-implementation-guide.md
 *
 * Server-authoritative: client sends action-request, server processes and returns result.
 * All data (maps, scenarios, monsters, abilities) loaded from DB (admin panel).
 */

const Hero = require('../models/Hero');
const Scenario = require('../models/Scenario');
const GameMap = require('../models/GameMap');
const MonsterTemplate = require('../models/MonsterTemplate');
const AbilityTemplate = require('../models/AbilityTemplate');
const StatusEffects = require('./StatusEffects');
const PathFinder = require('./PathFinder');
const LootGenerator = require('./LootGenerator');

const { ENCOUNTER_RANGE, COMBAT_ZONE_RANGE, SURPRISE_INITIATIVE_BONUS, SURPRISE_DAMAGE_BONUS } = require('../constants');

// ═══════════════════════════════════════════
// GAME INITIALIZATION
// ═══════════════════════════════════════════

class GameEngine {

  /**
   * Initialize a brand-new game state from DB (admin panel data)
   */
  static async initializeGame(session) {
    // 1. Load scenario and map from DB
    const scenario = await Scenario.findOne({ scenarioId: session.scenarioId }).lean();
    const gameMap = await GameMap.findOne({ mapId: session.mapId || scenario?.mapId }).lean();
    if (!scenario || !gameMap) throw new Error('Сценарий или карта не найдены в БД');

    // 2. Load heroes from DB
    const heroIds = session.players.map(p => p.heroId).filter(Boolean);
    const dbHeroes = await Hero.find({ _id: { $in: heroIds } }).lean();

    // 3. Load monster templates from DB
    const monsterTypes = (scenario.monsterPool || []).map(m => m.type || m).filter(Boolean);
    const monsterTemplates = monsterTypes.length ? await MonsterTemplate.find({ type: { $in: monsterTypes } }).lean() : [];
    const templateMap = {};
    monsterTemplates.forEach(t => { templateMap[t.type] = t; });

    // 4. Load all abilities referenced by heroes from DB
    const allAbilityIds = new Set();
    dbHeroes.forEach(h => {
      (h.abilities || []).forEach(a => allAbilityIds.add(typeof a === 'string' ? a : a.abilityId || a));
      (h.baseAbilities || []).forEach(a => allAbilityIds.add(typeof a === 'string' ? a : a.abilityId || a));
    });
    const abilityTemplates = allAbilityIds.size > 0
      ? await AbilityTemplate.find({ abilityId: { $in: [...allAbilityIds] } }).lean()
      : [];
    const abilityMap = {};
    abilityTemplates.forEach(a => { abilityMap[a.abilityId] = a; });

    const resolveAbilities = (arr) => (arr || []).map(a => {
      const id = typeof a === 'string' ? a : (a.abilityId || a);
      const tmpl = abilityMap[id];
      return tmpl
        ? { abilityId: tmpl.abilityId, name: tmpl.name, description: tmpl.description, manaCost: tmpl.manaCost || 0, cooldown: tmpl.cooldown || 0, type: tmpl.type, effect: tmpl.effect, difficulty: tmpl.difficulty, img: tmpl.img }
        : { abilityId: id, name: id, description: '', manaCost: 0, type: 'unknown' };
    });

    // 5. Build heroes array
    const heroes = dbHeroes.map((h, idx) => ({
      id: h._id.toString(),
      entityId: `hero_${h._id}`,
      entityType: 'hero',
      userId: h.userId.toString(),
      name: h.name,
      cls: h.cls,
      race: h.race,
      gender: h.gender || 'male',
      level: h.level || 1,
      hp: h.hp, maxHp: h.maxHp,
      mp: h.mp, maxMp: h.maxMp,
      attack: h.attack, agility: h.agility, armor: h.armor,
      intellect: h.intellect, wisdom: h.wisdom, charisma: h.charisma,
      moveRange: h.moveRange || 2,
      vision: h.vision || 4,
      equipment: h.equipment || {},
      inventory: (h.inventory || []).map(item => ({
        ...item,
        usable: item.usable || ['potion', 'scroll', 'food', 'tool'].includes(item.type),
      })),
      abilities: resolveAbilities(h.abilities),
      baseAbilities: resolveAbilities(h.baseAbilities),
      gold: h.gold || 0,
      silver: h.silver || 0,
      x: scenario.zones?.startZone?.[idx]?.x ?? (1 + idx * 2),
      y: scenario.zones?.startZone?.[idx]?.y ?? (gameMap.mapData.length - 2),
      alive: true,
      moveUsed: false,
      actionUsed: false,
      bonusActionUsed: false,
      stepsRemaining: h.moveRange || 2,
      statusEffects: [],
      abilityCooldowns: {},
    }));

    // 6. Build monsters array from scenario monsterPool positions
    const monsters = [];
    let mIdx = 0;
    for (const poolEntry of (scenario.monsterPool || [])) {
      const mType = poolEntry.type || poolEntry;
      const tmpl = templateMap[mType];
      if (!tmpl) continue;
      const positions = poolEntry.positions || [{ x: 5 + mIdx, y: 3 }];
      for (const pos of positions) {
        monsters.push({
          id: `monster_${mIdx}`,
          entityId: `monster_${mIdx}`,
          entityType: 'monster',
          templateType: tmpl.type,
          name: tmpl.name || tmpl.label || mType,
          label: tmpl.label || tmpl.name,
          hp: tmpl.hp, maxHp: tmpl.hp,
          armor: tmpl.armor || 0, attack: tmpl.attack || 0,
          agility: tmpl.agility || 0,
          moveRange: tmpl.moveRange || 2,
          vision: tmpl.vision || 4,
          attackRange: tmpl.attackRange || 1,
          damageDie: tmpl.damageDie || 'd6',
          xpReward: tmpl.xpReward || 0,
          goldMin: tmpl.goldMin || 0, goldMax: tmpl.goldMax || 0,
          aiType: tmpl.aiType || 'warrior',
          abilities: tmpl.abilities || [],
          canTalk: tmpl.canTalk || false,
          regenerates: tmpl.regenerates || false,
          fireVulnerable: tmpl.fireVulnerable || false,
          img: tmpl.img, tokenImg: tmpl.tokenImg,
          x: pos.x, y: pos.y,
          alive: true, hostile: true, discovered: false,
          lootTable: tmpl.xpReward >= 80 ? 'boss' : tmpl.xpReward >= 40 ? 'elite' : 'common',
          statusEffects: [],
          abilityCooldowns: {},
        });
        mIdx++;
      }
    }

    // 7. Build map objects from scenario zones
    const objects = [
      ...(scenario.zones?.chests || []).map((c, i) => ({
        id: `chest_${i}`, type: 'chest', subType: c.subType || 'normal',
        x: c.x, y: c.y, hidden: c.hidden !== false, discovered: !c.hidden,
        opened: false, loot: null,
      })),
      ...(scenario.zones?.traps || []).map((t, i) => ({
        id: `trap_${i}`, type: 'trap', subType: t.subType || 'snare',
        x: t.x, y: t.y, hidden: true, discovered: false,
        triggered: false, disarmed: false,
        trapData: {
          damage: t.damage || 8,
          status: t.status || 'snare',
          duration: t.duration || 1,
          dot: t.dot || 0,
        },
      })),
      ...(scenario.zones?.runes || []).map((r, i) => ({
        id: `rune_${i}`, type: 'rune', subType: r.subType || 'wisdom',
        x: r.x, y: r.y, hidden: true, discovered: false, activated: false,
      })),
      ...(scenario.zones?.questNpcs || []).map((n, i) => ({
        id: `questnpc_${i}`, type: 'questNpc',
        x: n.x, y: n.y, hidden: false, discovered: true,
        name: n.name || 'Пленник', dialog: n.dialog || '',
        rescued: false, hostile: false,
      })),
    ];

    // 8. Build NPCs and traders
    const npcs = [
      ...(scenario.friendlyNpcs || []).map((n, i) => ({
        id: `npc_${i}`, entityType: 'npc',
        x: n.x, y: n.y, name: n.name || 'NPC',
        dialog: n.dialog || '', canTalk: true, hostile: false,
      })),
      ...(scenario.traders || []).map((t, i) => ({
        id: `trader_${i}`, entityType: 'trader',
        x: t.x, y: t.y, name: t.name || 'Торговец',
        dialog: t.dialog || '', canTalk: true, hostile: false,
        inventory: t.inventory || [],
      })),
    ];

    // 9. Build fog of war
    const mapHeight = gameMap.mapData.length;
    const mapWidth = (gameMap.mapData[0] || []).length;
    const fog = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(0));

    // 10. Assemble full game state
    const gameState = {
      // Session metadata
      sessionId: session._id?.toString() || '',
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.name,
      scenarioDescription: scenario.description,
      mapId: gameMap.mapId,
      mapName: gameMap.name,

      // Game mode
      mode: 'explore', // briefing → explore → combat → result
      round: 0,
      currentTurnIdx: 0,
      turnOrder: [],

      // Map data (from admin panel)
      map: gameMap.mapData,
      terrain: gameMap.roadMap || [],
      mapWidth,
      mapHeight,
      bgImage: gameMap.bgImage || '',

      // Entities
      heroes,
      monsters,
      npcs,
      objects,

      // Fog of war
      fog,

      // Combat log
      combatLog: [],

      // Full scenario data (from admin panel)
      difficulty: scenario.difficulty || 'easy',
      playerLevel: scenario.playerLevel || 1,
      maxPlayers: scenario.maxPlayers || gameMap.maxPlayers || 4,
      objectives: scenario.objectives || {},
      rewards: scenario.rewards || {},
      briefing: scenario.briefing || {},
      dialogTrees: scenario.dialogTrees || {},
      winCondition: scenario.winCondition || 'all_enemies_dead',
      lossCondition: scenario.lossCondition || 'all_heroes_dead',
      introNarration: scenario.introNarration || '',
      bossType: scenario.bossType || '',

      // Scenario flags
      scenarioFlags: {},
      completedObjectives: [],
      startedAt: new Date(),
    };

    // 11. Initialize fog of war for hero positions
    for (const hero of heroes) {
      GameEngine.updateFogOfWar(gameState, hero);
    }

    return gameState;
  }

  // ═══════════════════════════════════════════
  // ACTION DISPATCHER
  // ═══════════════════════════════════════════

  static processAction(gameState, action, userId) {
    if (!gameState || !gameState.heroes) {
      return { error: 'Состояние игры не загружено' };
    }

    const { type } = action;

    switch (type) {
      case 'move':        return GameEngine.processMove(gameState, action, userId);
      case 'attack':      return GameEngine.processAttack(gameState, action, userId);
      case 'ability':     return GameEngine.processAbility(gameState, action, userId);
      case 'use-item':
      case 'item':        return GameEngine.processUseItem(gameState, action, userId);
      case 'equip':       return GameEngine.processEquip(gameState, action, userId);
      case 'unequip':     return GameEngine.processUnequip(gameState, action, userId);
      case 'interact':    return GameEngine.processInteract(gameState, action, userId);
      case 'loot':        return GameEngine.processLoot(gameState, action, userId);
      case 'search':      return GameEngine.processSearch(gameState, action, userId);
      case 'end-turn':    return GameEngine.processEndTurn(gameState, action, userId);
      case 'rest':        return GameEngine.processRest(gameState, action, userId);
      case 'free-action': return GameEngine.processFreeAction(gameState, action, userId);
      case 'sneak':       return GameEngine.processSneak(gameState, action, userId);
      case 'init-combat': return GameEngine.processInitCombat(gameState, action, userId);
      default:
        return { error: `Неизвестный тип действия: ${type}` };
    }
  }

  // ═══════════════════════════════════════════
  // MOVEMENT (§4)
  // ═══════════════════════════════════════════

  static processMove(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (StatusEffects.hasStatus(hero, 'rooted') || StatusEffects.hasStatus(hero, 'stunned') || StatusEffects.hasStatus(hero, 'stun')) {
      return { error: 'Герой не может двигаться' };
    }

    const { x, y } = action;
    if (x === undefined || y === undefined) return { error: 'Не указаны координаты' };
    if (x < 0 || y < 0 || x >= gameState.mapWidth || y >= gameState.mapHeight) return { error: 'За пределами карты' };

    const cellType = gameState.map[y]?.[x];
    if (cellType === PathFinder.WALL || cellType === 0) return { error: 'Стена' };

    // Check occupied
    const isOccupied = gameState.heroes.some(h => h.alive && h.x === x && h.y === y && h.id !== hero.id)
      || gameState.monsters.some(m => m.alive && m.x === x && m.y === y);
    if (isOccupied) return { error: 'Клетка занята' };

    // Check distance and reachability
    const dist = PathFinder.distance(hero, { x, y });
    const effectiveMoveRange = StatusEffects.getEffectiveMoveRange(hero);
    const stepsLeft = hero.stepsRemaining !== undefined ? hero.stepsRemaining : effectiveMoveRange;

    if (dist > stepsLeft) return { error: 'Слишком далеко (' + dist + ' > ' + stepsLeft + ')' };

    // Offroad check
    const isOffroad = cellType === PathFinder.OFFROAD || gameState.terrain?.[y]?.[x] === PathFinder.OFFROAD;
    if (isOffroad) {
      const maxOffroad = hero.cls === 'bard' ? 2 : 1;
      if (dist > maxOffroad) return { error: 'Бездорожье: макс ' + maxOffroad + ' клетка' };
    }

    // Water hazard check
    if (cellType === PathFinder.WATER) {
      const d20 = GameEngine.rollDice(20);
      const agiBonus = Math.max(0, (hero.agility || 6) - 6);
      const total = d20 + agiBonus;
      if (d20 === 1) {
        // Critical fail: 15 damage + drowning
        StatusEffects.applyDamageWithEffects(hero, 15);
        StatusEffects.applyStatus(hero, 'drowning');
        return {
          gameState,
          actionResult: { type: 'water-hazard', heroId: hero.id, heroName: hero.name, roll: d20, total, success: false, critFail: true, damage: 15, status: 'drowning' },
        };
      } else if (total < 10) {
        // Fail: 8 damage
        StatusEffects.applyDamageWithEffects(hero, 8);
        // Still move to the cell
      }
      // Success or failed (but still moved)
    }

    // Execute move
    const fromX = hero.x, fromY = hero.y;
    hero.x = x;
    hero.y = y;
    hero.stepsRemaining = Math.max(0, stepsLeft - dist);
    if (hero.stepsRemaining <= 0) hero.moveUsed = true;

    // Update fog of war
    GameEngine.updateFogOfWar(gameState, hero);

    // Check trap at new position
    const trap = gameState.objects.find(o => o.type === 'trap' && o.x === x && o.y === y && !o.triggered && !o.disarmed);
    let trapResult = null;
    if (trap) {
      trap.triggered = true;
      trap.discovered = true;
      trap.hidden = false;
      const damage = trap.trapData?.damage || 8;
      StatusEffects.applyDamageWithEffects(hero, damage);
      if (trap.trapData?.status) {
        StatusEffects.applyStatus(hero, trap.trapData.status, { duration: trap.trapData.duration });
      }
      trapResult = { trapId: trap.id, damage, status: trap.trapData?.status };
    }

    // Check encounter with monsters
    const encounter = GameEngine.checkEncounter(gameState, hero);

    return {
      gameState,
      actionResult: {
        type: 'move', heroId: hero.id, heroName: hero.name,
        from: { x: fromX, y: fromY }, to: { x, y },
        stepsRemaining: hero.stepsRemaining,
        trap: trapResult, encounter,
      },
    };
  }

  // ═══════════════════════════════════════════
  // ATTACK (§5.4)
  // ═══════════════════════════════════════════

  static processAttack(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.actionUsed) return { error: 'Действие уже использовано' };

    const target = gameState.monsters.find(m => (m.id === action.targetId || m.entityId === action.targetId) && m.alive);
    if (!target) return { error: 'Цель не найдена' };

    // Range check
    const dist = PathFinder.distance(hero, target);
    const weapon = hero.equipment?.weapon;
    const attackRange = weapon?.range || weapon?.attackRange || 1;
    if (dist > attackRange) return { error: 'Цель вне дальности (' + dist + ' > ' + attackRange + ')' };

    // === Phase 1: Hit roll (d20) ===
    const d20 = GameEngine.rollDice(20);
    const hitMod = StatusEffects.getHitModifier(hero);
    const effectiveRoll = d20 + hitMod;

    let isCrit = false;
    let isMiss = d20 === 1; // Nat 1 = always miss

    // Crit threshold
    let critThreshold = 20;
    if (target.abilities?.includes('quickStrike')) critThreshold = 17;
    if (hero._surpriseAttack) critThreshold = 17;

    if (d20 >= critThreshold) isCrit = true;

    // Effective armor
    const effectiveArmor = StatusEffects.getEffectiveArmor(target)
      + (target.abilities?.includes('shieldBlock') && !target.abilityCooldowns?.shieldBlock ? 4 : 0);

    if (target.abilities?.includes('shieldBlock') && !target.abilityCooldowns?.shieldBlock) {
      if (!target.abilityCooldowns) target.abilityCooldowns = {};
      target.abilityCooldowns.shieldBlock = 2;
    }

    const hits = isMiss ? false : (isCrit ? true : (effectiveRoll > effectiveArmor));

    // Dodge check
    let dodged = false;
    if (hits && target.abilities?.includes('dodge')) {
      if (Math.random() < 0.25) {
        dodged = true;
      }
    }

    let damage = 0;
    let damageRoll = 0;
    if (hits && !dodged) {
      // === Phase 2: Damage roll ===
      const die = weapon?.damage?.die || 'd4';
      damageRoll = GameEngine.rollDiceStr(die);

      const attackBonus = hero.attack || 0;
      const weaponBonus = weapon?.damage?.bonus || 0;
      const surpriseBonus = hero._surpriseAttack ? SURPRISE_DAMAGE_BONUS : 0;
      const statusBonus = StatusEffects.getAttackModifier(hero);

      let total = damageRoll + attackBonus + weaponBonus + surpriseBonus + statusBonus;
      if (isCrit) total *= 2;

      // === Phase 3: Apply damage ===
      damage = StatusEffects.applyDamageWithEffects(target, total);
    }

    hero.actionUsed = true;

    // === Phase 4: Counter-attack ===
    let counterAttack = null;
    if (hits && !dodged && target.alive && dist <= 1 && attackRange <= 1) {
      const counterD20 = GameEngine.rollDice(20);
      if (counterD20 > hero.armor) {
        const counterDie = GameEngine.rollDiceStr(target.damageDie || 'd6');
        const counterDmg = counterDie + (target.attack || 0);
        const actualCounterDmg = StatusEffects.applyDamageWithEffects(hero, counterDmg);
        counterAttack = { damage: actualCounterDmg, roll: counterD20 };
      }
    }

    // XP on kill
    let xpGained = 0;
    if (!target.alive) {
      xpGained = target.xpReward || 0;
      // Distribute XP to all living heroes
      const aliveHeroes = gameState.heroes.filter(h => h.alive);
      const xpPerHero = Math.ceil(xpGained / Math.max(1, aliveHeroes.length));
      aliveHeroes.forEach(h => { h.xp = (h.xp || 0) + xpPerHero; });
    }

    // Check win condition
    const allDead = gameState.monsters.every(m => !m.alive);

    const actionResult = {
      type: 'attack',
      heroId: hero.id, heroName: hero.name,
      targetId: target.id, targetName: target.name,
      d20, hitMod, effectiveRoll, effectiveArmor,
      hits, isCrit, isMiss, dodged,
      damageDie: weapon?.damage?.die || 'd4',
      damageRoll, damage,
      targetHp: target.hp, targetMaxHp: target.maxHp, targetAlive: target.alive,
      counterAttack, xpGained, allMonstersDefeated: allDead,
    };

    gameState.combatLog.push({ ...actionResult, timestamp: Date.now() });

    return { gameState, actionResult };
  }

  // ═══════════════════════════════════════════
  // ABILITY (§6)
  // ═══════════════════════════════════════════

  static processAbility(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.bonusActionUsed) return { error: 'Бонусное действие уже использовано' };
    if (!StatusEffects.canUseAbilities(hero)) return { error: 'Способности заблокированы' };

    const abilityId = action.abilityId;
    const allAbilities = [...(hero.abilities || []), ...(hero.baseAbilities || [])];
    const ability = allAbilities.find(a => a.abilityId === abilityId);
    if (!ability) return { error: 'Способность не найдена: ' + abilityId };

    // Mana check
    const manaCost = ability.manaCost || 0;
    let effectiveManaCost = manaCost;
    if (StatusEffects.hasStatus(hero, 'clarity')) effectiveManaCost = Math.max(0, manaCost - 2);
    if (hero.mp < effectiveManaCost) return { error: 'Недостаточно маны (' + hero.mp + '/' + effectiveManaCost + ')' };

    // Cooldown check
    if (hero.abilityCooldowns?.[abilityId] > 0) {
      return { error: 'Способность на перезарядке (' + hero.abilityCooldowns[abilityId] + ' ходов)' };
    }

    // Deduct mana
    hero.mp -= effectiveManaCost;
    hero.bonusActionUsed = true;

    // Set cooldown
    if (ability.cooldown) {
      if (!hero.abilityCooldowns) hero.abilityCooldowns = {};
      hero.abilityCooldowns[abilityId] = ability.cooldown;
    }

    // Process effect (simplified — actual effects depend on ability type)
    const effectResult = { applied: true, abilityName: ability.name, manaCost: effectiveManaCost };

    // Apply known effect patterns
    const effect = ability.effect || {};
    if (effect.heal && action.targetId) {
      const target = gameState.heroes.find(h => h.id === action.targetId || h.entityId === action.targetId);
      if (target) {
        target.hp = Math.min(target.maxHp, target.hp + effect.heal);
        effectResult.healing = effect.heal;
        effectResult.targetName = target.name;
      }
    }
    if (effect.shield) {
      StatusEffects.applyStatus(hero, 'arcane_shield', { value: effect.shield });
      effectResult.shield = effect.shield;
    }
    if (effect.damage && action.targetId) {
      const target = gameState.monsters.find(m => m.id === action.targetId && m.alive)
        || gameState.heroes.find(h => h.id === action.targetId);
      if (target) {
        const dmgRoll = typeof effect.damage === 'string' ? GameEngine.rollDiceStr(effect.damage) : effect.damage;
        const totalDmg = dmgRoll + (hero.intellect || 0);
        StatusEffects.applyDamageWithEffects(target, totalDmg);
        effectResult.damage = totalDmg;
        effectResult.targetName = target.name;
      }
    }
    if (effect.status && action.targetId) {
      const target = gameState.monsters.find(m => m.id === action.targetId && m.alive);
      if (target) {
        StatusEffects.applyStatus(target, effect.status, { duration: effect.duration });
        effectResult.statusApplied = effect.status;
      }
    }

    return {
      gameState,
      actionResult: { type: 'ability', heroId: hero.id, heroName: hero.name, abilityId, ...effectResult },
    };
  }

  // ═══════════════════════════════════════════
  // USE ITEM (§9)
  // ═══════════════════════════════════════════

  static processUseItem(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    let itemIdx = -1;
    if (action.itemIndex !== undefined) itemIdx = action.itemIndex;
    else if (action.itemId) itemIdx = hero.inventory.findIndex(i => i.itemId === action.itemId);
    if (itemIdx < 0 || itemIdx >= hero.inventory.length) return { error: 'Предмет не найден' };

    const item = hero.inventory[itemIdx];
    if (!item.usable && !['potion', 'scroll', 'food', 'tool'].includes(item.type)) {
      return { error: 'Нельзя использовать этот предмет' };
    }

    const effectResult = { itemName: item.name, itemType: item.type };

    // Apply effects
    if (item.effect?.heal) {
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + item.effect.heal);
      effectResult.healing = hero.hp - before;
    }
    if (item.effect?.mana) {
      const before = hero.mp;
      hero.mp = Math.min(hero.maxMp, hero.mp + item.effect.mana);
      effectResult.manaRestored = hero.mp - before;
    }
    if (item.effect?.vision) {
      hero.vision += item.effect.vision;
      effectResult.visionBonus = item.effect.vision;
      GameEngine.updateFogOfWar(gameState, hero);
    }
    if (item.effect?.status) {
      StatusEffects.applyStatus(hero, item.effect.status, { duration: item.effect.duration });
      effectResult.statusApplied = item.effect.status;
    }

    // Remove/decrement item
    if (item.stackable && (item.quantity || 1) > 1) {
      hero.inventory[itemIdx].quantity = (item.quantity || 1) - 1;
    } else {
      hero.inventory.splice(itemIdx, 1);
    }

    hero.bonusActionUsed = true;

    return {
      gameState,
      actionResult: { type: 'use-item', heroId: hero.id, heroName: hero.name, effect: item.effect, ...effectResult },
    };
  }

  // ═══════════════════════════════════════════
  // EQUIP / UNEQUIP (§9)
  // ═══════════════════════════════════════════

  static processEquip(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    // In combat, equip costs action
    if (gameState.mode === 'combat') {
      if (hero.actionUsed) return { error: 'Действие уже использовано' };
      hero.actionUsed = true;
    }

    const itemIdx = hero.inventory.findIndex(i => i.itemId === action.itemId);
    if (itemIdx < 0) return { error: 'Предмет не найден в инвентаре' };

    const item = hero.inventory[itemIdx];
    const slot = action.slot || item.slot;
    if (!slot || slot === 'none') return { error: 'Предмет нельзя экипировать' };

    // Swap with current equipment
    const current = hero.equipment[slot];
    hero.equipment[slot] = item;
    hero.inventory.splice(itemIdx, 1);
    if (current && current.name) hero.inventory.push(current);

    return {
      gameState,
      actionResult: { type: 'equip', heroId: hero.id, slot, itemName: item.name, previousItem: current?.name },
    };
  }

  static processUnequip(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    const slot = action.slot;
    const item = hero.equipment?.[slot];
    if (!item || !item.name) return { error: 'Слот пуст' };

    hero.inventory.push(item);
    hero.equipment[slot] = null;

    return {
      gameState,
      actionResult: { type: 'unequip', heroId: hero.id, slot, itemName: item.name },
    };
  }

  // ═══════════════════════════════════════════
  // SEARCH (§4 — Обнаружение объектов)
  // ═══════════════════════════════════════════

  static processSearch(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.bonusActionUsed) return { error: 'Бонусное действие уже использовано' };

    const d20 = GameEngine.rollDice(20);
    const agiBonus = Math.max(0, (hero.agility || 6) - 6);
    const total = d20 + agiBonus;
    const success = total >= 10;

    const radius = success ? Math.min(5, Math.max(1, Math.floor(d20 / 4))) : 0;
    const discovered = [];

    if (success) {
      for (const obj of (gameState.objects || [])) {
        if (obj.hidden && !obj.discovered) {
          const dist = PathFinder.distance(hero, obj);
          const maxDist = obj.type === 'trap' ? 2 : radius;
          if (dist <= maxDist) {
            obj.discovered = true;
            obj.hidden = false;
            discovered.push({ id: obj.id, type: obj.type, x: obj.x, y: obj.y, name: obj.name });
          }
        }
      }
    }

    hero.bonusActionUsed = true;

    return {
      gameState,
      actionResult: {
        type: 'search', heroId: hero.id, heroName: hero.name,
        success, roll: d20, bonus: agiBonus, total, radius,
        discovered,
      },
    };
  }

  // ═══════════════════════════════════════════
  // INTERACT (§10 — Chests, Runes, NPCs)
  // ═══════════════════════════════════════════

  static async processInteract(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    const obj = gameState.objects.find(o => o.id === action.targetId || o.id === action.objectId)
      || gameState.npcs?.find(n => n.id === action.targetId);
    if (!obj) return { error: 'Объект не найден' };

    let result = {};

    switch (obj.type || obj.entityType) {
      case 'chest': {
        if (obj.opened) return { error: 'Сундук уже открыт' };
        obj.opened = true;
        try {
          obj.loot = await LootGenerator.generateChestLoot(obj.subType || 'normal');
        } catch { obj.loot = []; }
        // Add loot to hero inventory
        for (const item of (obj.loot || [])) {
          if (item.type === 'currency') {
            if (item.currency === 'gold') hero.gold = (hero.gold || 0) + item.amount;
            else hero.silver = (hero.silver || 0) + item.amount;
          } else {
            GameEngine.addToInventory(hero, item);
          }
        }
        result = { type: 'chest', loot: obj.loot };
        break;
      }
      case 'trap': {
        if (obj.disarmed) return { error: 'Ловушка обезврежена' };
        const d20 = GameEngine.rollDice(20);
        const agiBonus = Math.max(0, (hero.agility || 6) - 6);
        if (d20 + agiBonus >= 12) {
          obj.disarmed = true;
          result = { type: 'trap-disarm', success: true, roll: d20 };
        } else {
          const damage = obj.trapData?.damage || 8;
          StatusEffects.applyDamageWithEffects(hero, damage);
          if (obj.trapData?.status) StatusEffects.applyStatus(hero, obj.trapData.status);
          result = { type: 'trap-trigger', success: false, roll: d20, damage };
        }
        break;
      }
      case 'rune': {
        if (obj.activated) return { error: 'Руна уже активирована' };
        const d20 = GameEngine.rollDice(20);
        if (d20 >= 8) {
          obj.activated = true;
          result = { type: 'rune', subType: obj.subType, success: true, roll: d20 };
          // Apply rune bonus
        } else {
          result = { type: 'rune', success: false, roll: d20 };
        }
        break;
      }
      case 'questNpc': {
        if (obj.rescued) return { error: 'Уже спасён' };
        obj.rescued = true;
        result = { type: 'questNpc', name: obj.name, message: obj.dialog || `${obj.name} спасён!` };
        break;
      }
      case 'npc':
      case 'trader': {
        result = { type: 'npc-dialog', name: obj.name, dialog: obj.dialog, canTrade: obj.entityType === 'trader' };
        break;
      }
      default:
        result = { type: obj.type, message: 'Взаимодействие' };
    }

    hero.bonusActionUsed = true;
    return { gameState, actionResult: { type: 'interact', heroId: hero.id, ...result } };
  }

  // ═══════════════════════════════════════════
  // LOOT (§9.6)
  // ═══════════════════════════════════════════

  static async processLoot(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    const corpse = gameState.monsters.find(m => m.id === action.objectId && !m.alive);
    if (!corpse) return { error: 'Тело не найдено' };
    if (corpse.looted) return { error: 'Уже обобрано' };

    const dist = PathFinder.distance(hero, corpse);
    if (dist > 1) return { error: 'Слишком далеко' };

    corpse.looted = true;
    let loot;
    try {
      loot = await LootGenerator.generateMonsterLoot(corpse);
    } catch { loot = []; }

    for (const item of loot) {
      if (item.type === 'currency') {
        if (item.currency === 'gold') hero.gold = (hero.gold || 0) + item.amount;
        else hero.silver = (hero.silver || 0) + item.amount;
      } else {
        GameEngine.addToInventory(hero, item);
      }
    }

    hero.bonusActionUsed = true;
    return { gameState, actionResult: { type: 'loot', heroId: hero.id, heroName: hero.name, targetName: corpse.name, loot } };
  }

  // ═══════════════════════════════════════════
  // REST
  // ═══════════════════════════════════════════

  static processRest(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.bonusActionUsed) return { error: 'Бонусное действие уже использовано' };

    const healPct = 0.15;
    const healAmount = Math.max(1, Math.floor(hero.maxHp * healPct));
    const before = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
    hero.bonusActionUsed = true;

    return {
      gameState,
      actionResult: { type: 'rest', heroId: hero.id, heroName: hero.name, hpRestored: hero.hp - before },
    };
  }

  // ═══════════════════════════════════════════
  // FREE ACTION (§12)
  // ═══════════════════════════════════════════

  static processFreeAction(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.bonusActionUsed) return { error: 'Бонусное действие уже использовано' };

    const text = action.text || action.description || 'Свободное действие';
    const d20 = GameEngine.rollDice(20);
    const bonus = Math.max((hero.charisma || 6) - 6, (hero.wisdom || 6) - 6);
    const total = d20 + bonus;
    const success = total >= 10;

    hero.bonusActionUsed = true;

    return {
      gameState,
      actionResult: {
        type: 'free-action', heroId: hero.id, heroName: hero.name,
        text, roll: d20, bonus, total, success,
        description: success
          ? `${hero.name}: "${text}" — Успех! (d20=${d20}+${bonus}=${total} ≥ 10)`
          : `${hero.name}: "${text}" — Неудача (d20=${d20}+${bonus}=${total} < 10)`,
      },
    };
  }

  // ═══════════════════════════════════════════
  // SNEAK
  // ═══════════════════════════════════════════

  static processSneak(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };
    if (hero.bonusActionUsed) return { error: 'Бонусное действие уже использовано' };

    const d20 = GameEngine.rollDice(20);
    const agiBonus = Math.max(0, (hero.agility || 6) - 6);
    const terrainBonus = (gameState.map?.[hero.y]?.[hero.x] === PathFinder.OFFROAD) ? 5 : 0;
    const total = d20 + agiBonus + terrainBonus;
    const dc = 12;
    const success = total >= dc;

    hero.bonusActionUsed = true;
    if (success) {
      StatusEffects.applyStatus(hero, 'stealth', { duration: 2 });
    }

    return {
      gameState,
      actionResult: {
        type: 'sneak', heroId: hero.id, heroName: hero.name,
        success, roll: d20, bonus: agiBonus + terrainBonus, total, dc,
      },
    };
  }

  // ═══════════════════════════════════════════
  // END TURN (§5.3)
  // ═══════════════════════════════════════════

  static processEndTurn(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    // Process end-of-turn status effects
    StatusEffects.tickEndOfTurn(hero);

    // Decrement ability cooldowns
    if (hero.abilityCooldowns) {
      for (const key of Object.keys(hero.abilityCooldowns)) {
        hero.abilityCooldowns[key] = Math.max(0, hero.abilityCooldowns[key] - 1);
      }
    }

    // Reset turn resources
    hero.moveUsed = false;
    hero.actionUsed = false;
    hero.bonusActionUsed = false;
    hero.stepsRemaining = StatusEffects.getEffectiveMoveRange(hero);

    // In combat mode, advance turn
    if (gameState.mode === 'combat' && gameState.turnOrder.length > 0) {
      gameState.currentTurnIdx++;
      if (gameState.currentTurnIdx >= gameState.turnOrder.length) {
        gameState.currentTurnIdx = 0;
        gameState.round++;

        // Process all entities' start-of-turn
        for (const entity of [...gameState.heroes, ...gameState.monsters]) {
          if (entity.alive) {
            StatusEffects.tickStartOfTurn(entity);
            // Monster regeneration
            if (entity.regenerates && entity.entityType === 'monster') {
              entity.hp = Math.min(entity.maxHp, entity.hp + 3);
            }
          }
        }
      }

      // Check for monster turn AI (simplified: auto-attack nearest hero)
      const currentEntity = gameState.turnOrder[gameState.currentTurnIdx];
      if (currentEntity?.type === 'monster') {
        GameEngine.processMonsterTurn(gameState, currentEntity.entityId);
      }
    } else {
      // Explore mode: just increment round
      gameState.round++;
    }

    return {
      gameState,
      actionResult: {
        type: 'end-turn', heroId: hero.id, heroName: hero.name,
        round: gameState.round, turnIdx: gameState.currentTurnIdx,
      },
    };
  }

  // ═══════════════════════════════════════════
  // COMBAT INITIATION (§5.1)
  // ═══════════════════════════════════════════

  static processInitCombat(gameState, action, userId) {
    const hero = GameEngine.getHero(gameState, userId);
    if (!hero) return { error: 'Герой не найден' };

    const targetMonster = gameState.monsters.find(m => m.id === action.targetMonsterId && m.alive);
    if (!targetMonster) return { error: 'Монстр не найден' };

    return GameEngine.startCombat(gameState, hero, targetMonster);
  }

  static startCombat(gameState, triggerHero, triggerMonster) {
    gameState.mode = 'combat';
    gameState.round = 1;

    // All heroes in combat zone
    const heroIds = gameState.heroes.filter(h => h.alive && PathFinder.distance(h, triggerMonster) <= COMBAT_ZONE_RANGE).map(h => h.entityId);
    // All monsters in combat zone
    const monsterIds = gameState.monsters.filter(m => m.alive && PathFinder.distance(m, triggerMonster) <= COMBAT_ZONE_RANGE).map(m => m.entityId);

    // Roll initiative
    const combatants = [];
    for (const h of gameState.heroes) {
      if (heroIds.includes(h.entityId)) {
        const roll = GameEngine.rollDice(6);
        combatants.push({ entityId: h.entityId, type: 'hero', name: h.name, initiative: roll });
      }
    }
    for (const m of gameState.monsters) {
      if (monsterIds.includes(m.entityId)) {
        const roll = GameEngine.rollDice(6) + (m.agility || 0);
        combatants.push({ entityId: m.entityId, type: 'monster', name: m.name, initiative: roll });
      }
    }

    combatants.sort((a, b) => b.initiative - a.initiative);
    gameState.turnOrder = combatants;
    gameState.currentTurnIdx = 0;

    return {
      gameState,
      actionResult: {
        type: 'combat-start', turnOrder: combatants, round: 1,
        heroes: heroIds, monsters: monsterIds,
      },
    };
  }

  // ═══════════════════════════════════════════
  // MONSTER AI TURN (§8)
  // ═══════════════════════════════════════════

  static processMonsterTurn(gameState, monsterEntityId) {
    const monster = gameState.monsters.find(m => m.entityId === monsterEntityId && m.alive);
    if (!monster) return;

    // Skip if stunned
    const tickResult = StatusEffects.tickStartOfTurn(monster);
    if (tickResult.skipTurn) return;

    // Find nearest alive hero
    let target = null;
    let minDist = Infinity;
    for (const h of gameState.heroes) {
      if (!h.alive) continue;
      const d = PathFinder.distance(monster, h);
      if (d < minDist) { minDist = d; target = h; }
    }

    if (!target) return;

    // If in attack range → attack
    if (minDist <= (monster.attackRange || 1)) {
      const d20 = GameEngine.rollDice(20);
      if (d20 > target.armor) {
        const dmgRoll = GameEngine.rollDiceStr(monster.damageDie || 'd6');
        const damage = dmgRoll + (monster.attack || 0);
        StatusEffects.applyDamageWithEffects(target, damage);

        gameState.combatLog.push({
          type: 'monster-attack', monsterName: monster.name, targetName: target.name,
          d20, damage, targetHp: target.hp, timestamp: Date.now(),
        });
      }
    } else {
      // Move toward target
      const dx = target.x > monster.x ? 1 : (target.x < monster.x ? -1 : 0);
      const dy = target.y > monster.y ? 1 : (target.y < monster.y ? -1 : 0);
      const nx = monster.x + dx;
      const ny = monster.y + dy;
      if (nx >= 0 && ny >= 0 && nx < gameState.mapWidth && ny < gameState.mapHeight) {
        if (gameState.map[ny]?.[nx] !== PathFinder.WALL) {
          const occupied = gameState.heroes.some(h => h.alive && h.x === nx && h.y === ny)
            || gameState.monsters.some(m => m.alive && m.x === nx && m.y === ny && m.id !== monster.id);
          if (!occupied) {
            monster.x = nx;
            monster.y = ny;
          }
        }
      }
    }

    // End monster turn, advance
    StatusEffects.tickEndOfTurn(monster);
  }

  // ═══════════════════════════════════════════
  // FOG OF WAR (§4.4)
  // ═══════════════════════════════════════════

  static updateFogOfWar(gameState, hero) {
    if (!gameState.fog) return;

    let vision = hero.vision || 4;
    if (hero.race === 'elf') vision += 1;
    // Torch bonus
    const hasTorch = hero.statusEffects?.some(e => e.type === 'torch') || hero.inventory?.some(i => i.itemId === 'torch' && i.activated);
    if (hasTorch) vision += 1;

    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const ny = hero.y + dy;
        const nx = hero.x + dx;
        if (ny < 0 || ny >= gameState.mapHeight || nx < 0 || nx >= gameState.mapWidth) continue;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist <= vision) {
          if (PathFinder.hasLineOfSight(hero, { x: nx, y: ny }, gameState.map, gameState.mapWidth, gameState.mapHeight)) {
            gameState.fog[ny][nx] = 2; // visible
          } else if (gameState.fog[ny][nx] < 1) {
            gameState.fog[ny][nx] = 1; // explored
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // ENCOUNTER CHECK
  // ═══════════════════════════════════════════

  static checkEncounter(gameState, hero) {
    if (gameState.mode === 'combat') return null;
    for (const m of gameState.monsters) {
      if (!m.alive || m.discovered) continue;
      const dist = PathFinder.distance(hero, m);
      if (dist <= ENCOUNTER_RANGE) {
        m.discovered = true;
        return { monsterId: m.id, monsterName: m.name, distance: dist, canTalk: m.canTalk };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  static getHero(gameState, userId) {
    return gameState.heroes.find(h => h.userId === userId && h.alive);
  }

  static rollDice(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * Add item to hero inventory with stacking support
   * Stackable items (potions, scrolls, food, tools, junk) stack by itemId
   */
  static addToInventory(hero, item) {
    if (!hero.inventory) hero.inventory = [];
    const qty = item.quantity || 1;
    const isStackable = item.stackable || ['potion', 'scroll', 'food', 'tool', 'junk', 'quest'].includes(item.type);

    if (isStackable && item.itemId) {
      const existing = hero.inventory.find(i => i.itemId === item.itemId);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + qty;
        return;
      }
    }

    hero.inventory.push({ ...item, quantity: qty });
  }

  static rollDiceStr(dieStr) {
    if (!dieStr) return GameEngine.rollDice(6);
    // Parse "2d8", "d6", "d20"
    const match = dieStr.match(/(\d*)d(\d+)/);
    if (!match) return GameEngine.rollDice(6);
    const count = parseInt(match[1] || '1');
    const sides = parseInt(match[2]);
    let total = 0;
    for (let i = 0; i < count; i++) total += GameEngine.rollDice(sides);
    return total;
  }
}

module.exports = GameEngine;
