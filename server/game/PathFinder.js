/**
 * PathFinder — BFS pathfinding for Taloria grid maps
 * Based on game-implementation-guide.md §4.3
 */

const WALL = 0;
const ROAD = 1;
const OFFROAD = 2;
const WATER = 3;

const OFFROAD_MOVE_RANGE = 1;
const BARD_OFFROAD_RANGE = 2;

/**
 * Get all reachable cells from startPos within moveRange
 * @param {object} startPos - {x, y}
 * @param {number} moveRange - max steps
 * @param {object} gameState - full game state
 * @param {string} cls - hero class (for bard offroad bonus)
 * @returns {Array<{x,y,cost}>}
 */
function getReachableCells(startPos, moveRange, gameState, cls = '') {
  const { map, mapWidth, mapHeight, heroes, monsters } = gameState;
  const reachable = [];
  const visited = new Set();
  const queue = [{ x: startPos.x, y: startPos.y, cost: 0 }];
  visited.add(`${startPos.x},${startPos.y}`);

  const isOccupied = (x, y) => {
    if (heroes?.some(h => h.alive && h.x === x && h.y === y && !(h.x === startPos.x && h.y === startPos.y))) return true;
    if (monsters?.some(m => m.alive && m.x === x && m.y === y)) return true;
    return false;
  };

  while (queue.length > 0) {
    const { x, y, cost } = queue.shift();

    if (cost > 0) {
      reachable.push({ x, y, cost });
    }

    if (cost >= moveRange) continue;

    // 4 directions
    const neighbors = [
      { x: x - 1, y }, { x: x + 1, y },
      { x, y: y - 1 }, { x, y: y + 1 },
    ];

    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      if (n.x < 0 || n.y < 0 || n.x >= mapWidth || n.y >= mapHeight) continue;

      const cellType = map[n.y]?.[n.x];
      if (cellType === WALL || cellType === undefined) continue;
      if (isOccupied(n.x, n.y)) continue;

      // Offroad restriction
      const terrain = gameState.terrain?.[n.y]?.[n.x];
      const isOffroad = cellType === OFFROAD || terrain === OFFROAD || terrain === 'offroad';
      if (isOffroad) {
        const maxOffroad = cls === 'bard' ? BARD_OFFROAD_RANGE : OFFROAD_MOVE_RANGE;
        if (cost + 1 > maxOffroad) continue;
      }

      if (cost + 1 <= moveRange) {
        visited.add(key);
        queue.push({ x: n.x, y: n.y, cost: cost + 1 });
      }
    }
  }

  return reachable;
}

/**
 * Manhattan distance
 */
function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if two positions are adjacent (distance 1)
 */
function isAdjacent(a, b) {
  return distance(a, b) === 1;
}

/**
 * Simple line-of-sight check (Bresenham-ish)
 */
function hasLineOfSight(from, to, map, mapWidth, mapHeight) {
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x0 === x1 && y0 === y1) return true;
    if (x0 < 0 || y0 < 0 || x0 >= mapWidth || y0 >= mapHeight) return false;
    if (map[y0]?.[x0] === WALL && !(x0 === from.x && y0 === from.y)) return false;

    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/**
 * Get cells within radius (Manhattan) with optional LoS check
 */
function getCellsInRadius(center, radius, mapWidth, mapHeight) {
  const cells = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const nx = center.x + dx, ny = center.y + dy;
      if (nx >= 0 && ny >= 0 && nx < mapWidth && ny < mapHeight) {
        cells.push({ x: nx, y: ny });
      }
    }
  }
  return cells;
}

module.exports = {
  getReachableCells,
  distance,
  isAdjacent,
  hasLineOfSight,
  getCellsInRadius,
  WALL, ROAD, OFFROAD, WATER,
};
