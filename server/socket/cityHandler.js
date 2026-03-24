const Hero = require('../models/Hero');
const NpcShop = require('../models/NpcShop');
const GameItem = require('../models/GameItem');
const TradeOffer = require('../models/TradeOffer');
const logger = require('../services/logger');
const { CITY_LOCATIONS } = require('../constants');
const { lobbyPlayers } = require('../routes/city');

const SELL_PRICES = { common: 1, uncommon: 10, rare: 50, epic: 200, legendary: 5000 };

function setupCityHandler(io) {
  const cityNsp = io.of('/city');

  cityNsp.use((socket, next) => {
    if (!socket.handshake.auth?.userId) {
      return next(new Error('Authentication required'));
    }
    socket.userId = socket.handshake.auth.userId;
    socket.displayName = socket.handshake.auth.displayName || 'Игрок';
    next();
  });

  cityNsp.on('connection', (socket) => {
    logger.info('City socket connected', { userId: socket.userId });

    // ===== JOIN LOCATION =====
    socket.on('city-join', async (data) => {
      try {
        const { locationId, heroId } = data;
        const location = CITY_LOCATIONS.find(l => l.id === locationId);
        if (!location) return socket.emit('error', { message: 'Локация не найдена' });

        // Leave previous location
        if (socket.currentLocation) {
          socket.leave(`city:${socket.currentLocation}`);
          const prevPlayers = lobbyPlayers.get(socket.currentLocation);
          if (prevPlayers) {
            prevPlayers.delete(socket.userId);
            cityNsp.to(`city:${socket.currentLocation}`).emit('city-player-left', {
              userId: socket.userId,
              displayName: socket.displayName,
            });
          }
        }

        // Check capacity
        const players = lobbyPlayers.get(locationId) || new Map();
        if (players.size >= location.maxPlayers) {
          return socket.emit('error', { message: 'Локация заполнена' });
        }

        // Get hero data
        let hero = null;
        if (heroId) {
          hero = await Hero.findOne({ _id: heroId, userId: socket.userId }).lean();
        }

        const playerData = {
          userId: socket.userId,
          displayName: socket.displayName,
          heroId: hero?._id?.toString() || null,
          heroName: hero?.name || '',
          cls: hero?.cls || '',
          level: hero?.level || 1,
          position: { x: 5, y: 5 },
          joinedAt: new Date(),
        };

        players.set(socket.userId, playerData);
        lobbyPlayers.set(locationId, players);

        socket.join(`city:${locationId}`);
        socket.currentLocation = locationId;
        socket.heroId = heroId;

        // Notify others
        socket.to(`city:${locationId}`).emit('city-player-joined', playerData);

        // Send full state to joining player
        socket.emit('city-lobby-state', {
          locationId,
          players: Array.from(players.values()),
        });
      } catch (err) {
        logger.error('city-join error', { error: err.message });
        socket.emit('error', { message: 'Ошибка входа в локацию' });
      }
    });

    // ===== LEAVE LOCATION =====
    socket.on('city-leave', () => {
      leaveLocation(socket, cityNsp);
    });

    // ===== MOVEMENT =====
    socket.on('city-move', (data) => {
      const { x, y } = data;
      if (!socket.currentLocation) return;

      const players = lobbyPlayers.get(socket.currentLocation);
      const player = players?.get(socket.userId);
      if (player) {
        player.position = { x, y };
      }

      cityNsp.to(`city:${socket.currentLocation}`).emit('city-player-moved', {
        userId: socket.userId,
        x, y,
      });
    });

    // ===== CHAT =====
    socket.on('city-chat', (data) => {
      if (!socket.currentLocation) return;
      const text = (data.text || '').slice(0, 200);
      if (!text) return;

      cityNsp.to(`city:${socket.currentLocation}`).emit('city-chat-message', {
        userId: socket.userId,
        displayName: socket.displayName,
        text,
        timestamp: new Date().toISOString(),
      });
    });

    // ===== NPC BUY =====
    socket.on('npc-buy', async (data) => {
      try {
        const { locationId, itemId, qty = 1, heroId } = data;
        const npcShop = await NpcShop.findOne({ locationId });
        if (!npcShop) return socket.emit('error', { message: 'Магазин не найден' });

        const hero = await Hero.findOne({ _id: heroId, userId: socket.userId });
        if (!hero) return socket.emit('error', { message: 'Герой не найден' });

        const gameItem = await GameItem.findOne({ itemId, active: true }).lean();
        if (!gameItem) return socket.emit('error', { message: 'Предмет не найден' });

        const price = (gameItem.price || SELL_PRICES[gameItem.rarity] || 1) * qty;

        if (hero.silver < price) {
          return socket.emit('error', { message: `Нужно ${price} серебра` });
        }

        hero.silver -= price;
        const existing = hero.inventory.find(i => i.itemId === itemId && i.stackable);
        if (existing) {
          existing.quantity = (existing.quantity || 1) + qty;
        } else {
          hero.inventory.push({ ...gameItem, quantity: qty });
        }

        npcShop.silverBalance += price;
        await Promise.all([hero.save(), npcShop.save()]);

        socket.emit('npc-buy-result', { hero, npcState: { gold: npcShop.goldBalance, silver: npcShop.silverBalance } });
        cityNsp.to(`city:${locationId}`).emit('npc-state-update', {
          locationId,
          npcState: { gold: npcShop.goldBalance, silver: npcShop.silverBalance },
        });
      } catch (err) {
        logger.error('npc-buy error', { error: err.message });
        socket.emit('error', { message: 'Ошибка покупки' });
      }
    });

    // ===== NPC SELL =====
    socket.on('npc-sell', async (data) => {
      try {
        const { locationId, itemIndex, heroId } = data;
        const npcShop = await NpcShop.findOne({ locationId });
        if (!npcShop) return socket.emit('error', { message: 'Магазин не найден' });

        const hero = await Hero.findOne({ _id: heroId, userId: socket.userId });
        if (!hero) return socket.emit('error', { message: 'Герой не найден' });

        const item = hero.inventory[itemIndex];
        if (!item) return socket.emit('error', { message: 'Предмет не найден' });

        let sellPrice = SELL_PRICES[item.rarity] || 1;
        if (npcShop.thematicTypes.includes(item.type)) {
          sellPrice = Math.ceil(sellPrice * 1.2);
        }

        if (npcShop.silverBalance < sellPrice) {
          return socket.emit('error', { message: 'У торговца нет средств' });
        }

        // Remove item
        if (item.stackable && (item.quantity || 1) > 1) {
          hero.inventory[itemIndex].quantity--;
        } else {
          hero.inventory.splice(itemIndex, 1);
        }

        hero.silver += sellPrice;
        npcShop.silverBalance -= sellPrice;
        npcShop.soldToNpcItems.push({
          itemId: item.itemId || `sold-${Date.now()}`,
          name: item.name,
          rarity: item.rarity || 'common',
          qty: 1,
          price: sellPrice,
          soldBy: socket.userId,
        });

        await Promise.all([hero.save(), npcShop.save()]);

        socket.emit('npc-sell-result', { hero, sellPrice, npcState: { gold: npcShop.goldBalance, silver: npcShop.silverBalance } });
        cityNsp.to(`city:${locationId}`).emit('npc-state-update', {
          locationId,
          npcState: { gold: npcShop.goldBalance, silver: npcShop.silverBalance },
        });
      } catch (err) {
        logger.error('npc-sell error', { error: err.message });
        socket.emit('error', { message: 'Ошибка продажи' });
      }
    });

    // ===== TRADE REQUEST =====
    socket.on('city-trade-request', (data) => {
      const { targetUserId } = data;
      if (!socket.currentLocation) return;

      // Find target socket in same room
      const room = cityNsp.adapter.rooms.get(`city:${socket.currentLocation}`);
      if (!room) return;

      cityNsp.to(`city:${socket.currentLocation}`).emit('city-trade-invite', {
        fromUserId: socket.userId,
        fromDisplayName: socket.displayName,
        locationId: socket.currentLocation,
      });
    });

    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
      leaveLocation(socket, cityNsp);
    });
  });
}

function leaveLocation(socket, cityNsp) {
  if (!socket.currentLocation) return;

  const locationId = socket.currentLocation;
  const players = lobbyPlayers.get(locationId);
  if (players) {
    players.delete(socket.userId);
    if (players.size === 0) lobbyPlayers.delete(locationId);
  }

  socket.leave(`city:${locationId}`);
  cityNsp.to(`city:${locationId}`).emit('city-player-left', {
    userId: socket.userId,
    displayName: socket.displayName,
  });

  socket.currentLocation = null;
}

module.exports = { setupCityHandler };
