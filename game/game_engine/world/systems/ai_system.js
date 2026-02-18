import { isWall } from '../loader.js';

function cellFromWorld(pos, cellSize) {
  return {
    x: Math.round(pos.x / cellSize),
    y: Math.round(pos.z / cellSize),
  };
}

function worldFromCell(cell, cellSize) {
  return {
    x: cell.x * cellSize,
    z: cell.y * cellSize,
  };
}

function openNeighbors(map, width, height, cell) {
  const neighbors = [];
  const candidates = [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ];
  for (const n of candidates) {
    if (!isWall(map, width, height, n.x, n.y)) neighbors.push(n);
  }
  return neighbors;
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function bfsNext(map, width, height, start, goal, maxSteps = 2000) {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  if (startKey === goalKey) return start;

  const queue = [start];
  const parent = new Map();
  parent.set(startKey, null);

  let steps = 0;
  while (queue.length && steps < maxSteps) {
    steps++;
    const current = queue.shift();
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (parent.has(key)) continue;
      if (isWall(map, width, height, n.x, n.y)) continue;
      parent.set(key, current);
      if (key === goalKey) {
        let step = n;
        let prev = parent.get(key);
        while (prev && `${prev.x},${prev.y}` !== startKey) {
          step = prev;
          prev = parent.get(`${prev.x},${prev.y}`);
        }
        return step;
      }
      queue.push(n);
    }
  }
  return start;
}

export function createAISystem({ map, width, height, cellSize, enemies, getPlayerPosition, onPlayerHit }) {
  const state = {
    map,
    width,
    height,
    cellSize,
    enemies,
    lastPlayerPos: null,
    playerVel: { x: 0, z: 0 },
  };

  function update(dt) {
    const playerPos = getPlayerPosition();
    if (!playerPos) return;

    if (state.lastPlayerPos) {
      state.playerVel.x = playerPos.x - state.lastPlayerPos.x;
      state.playerVel.z = playerPos.z - state.lastPlayerPos.z;
    }
    state.lastPlayerPos = playerPos.clone();

    for (const enemy of state.enemies) {
      if (!enemy?.el) continue;
      const pos = enemy.el.object3D.position;
      const currentCell = cellFromWorld(pos, cellSize);
      const targetCell = cellFromWorld(playerPos, cellSize);

      const behavior = enemy.behavior || 'chaser';
      let goalCell = targetCell;

      if (!enemy.ai) {
        enemy.ai = { wanderTarget: null, wanderTimer: 0 };
      }

      if (behavior === 'ambusher') {
        const vel = state.playerVel;
        const mag = Math.hypot(vel.x, vel.z);
        if (mag > 0.01) {
          const dirX = vel.x / mag;
          const dirZ = vel.z / mag;
          const lead = enemy.leadSteps || 3;
          const predicted = {
            x: Math.round(targetCell.x + dirX * lead),
            y: Math.round(targetCell.y + dirZ * lead),
          };
          goalCell = isWall(map, width, height, predicted.x, predicted.y) ? targetCell : predicted;
        }
      }

      if (behavior === 'wanderer') {
        enemy.ai.wanderTimer -= dt;
        const reached =
          enemy.ai.wanderTarget &&
          enemy.ai.wanderTarget.x === currentCell.x &&
          enemy.ai.wanderTarget.y === currentCell.y;
        if (!enemy.ai.wanderTarget || enemy.ai.wanderTimer <= 0 || reached) {
          const options = openNeighbors(map, width, height, currentCell);
          enemy.ai.wanderTarget = pickRandom(options) || currentCell;
          enemy.ai.wanderTimer = 1.2 + Math.random() * 2.5;
        }
        goalCell = enemy.ai.wanderTarget || targetCell;
      }

      const nextCell = bfsNext(map, width, height, currentCell, goalCell);
      const nextWorld = worldFromCell(nextCell, cellSize);
      const dirX = nextWorld.x - pos.x;
      const dirZ = nextWorld.z - pos.z;
      const dist = Math.hypot(dirX, dirZ);
      if (dist > 0.01) {
        const step = Math.min(dist, (enemy.speed || 1.2) * cellSize * dt);
        pos.x += (dirX / dist) * step;
        pos.z += (dirZ / dist) * step;
        if (enemy.el?.object3D) {
          const yaw = Math.atan2(-dirX, dirZ);
          const yawOffset = Number(enemy.yawOffset) || 0;
          const current = enemy.el.object3D.rotation.y;
          const target = yaw + yawOffset;
          const delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
          const turnSpeed = enemy.turnSpeed || 6;
          const turnFactor = Math.min(1, Math.max(0, turnSpeed) * dt);
          enemy.el.object3D.rotation.y = current + delta * turnFactor;
        }
      }

      const hitDist = Number(enemy.hitRadius) || (cellSize * 0.35);
      if (Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) < hitDist) {
        if (typeof onPlayerHit === 'function') onPlayerHit(enemy);
      }
    }
  }

  return { update };
}
