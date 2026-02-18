import { isWall, worldToCell } from '../loader.js';
import { collectOpenCells } from '../../generation/world_generation/spawns.js';

function clampNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function createSpawnSystem({
  map,
  width,
  height,
  cellSize,
  collisionSystem,
  enemyEntities,
  enemyIds,
  spawnEnemy,
  getPlayerPosition,
  getGoalCell,
  worldArea = 0,
  config = {},
  difficulty = {},
} = {}) {
  const spawnCfg = config.spawn || {};
  const baseIntervalMs = clampNum(spawnCfg.interval_ms, 850);
  const maxActiveBase = clampNum(spawnCfg.max_active_base, 12);
  const maxActiveAreaDiv = clampNum(spawnCfg.max_active_area_div, 55);
  const minDist = clampNum(spawnCfg.min_dist_cells, 6) * cellSize;
  const maxDist = clampNum(spawnCfg.max_dist_cells, 14) * cellSize;
  const nearEnemyDist = clampNum(spawnCfg.near_enemy_dist_cells, 2.5) * cellSize;
  const despawnDist = clampNum(spawnCfg.despawn_dist_cells, 22) * cellSize;
  const despawnCheckMs = Math.max(500, Math.round(clampNum(spawnCfg.despawn_check_ms, 2000)));
  const despawnStuckMs = Math.max(2000, Math.round(clampNum(spawnCfg.despawn_stuck_ms, 12000)));
  const despawnInsideWall = spawnCfg.despawn_inside_wall !== false;
  const spawnBatchBase = Math.max(1, Math.round(clampNum(spawnCfg.spawn_batch, 2)));
  const spawnAttempts = Math.max(10, Math.round(clampNum(spawnCfg.spawn_attempts, 60)));
  const fallbackAttempts = Math.max(10, Math.round(clampNum(spawnCfg.fallback_attempts, 80)));
  const spawnGraceMs = Math.max(0, Math.round(clampNum(spawnCfg.grace_ms, 2200)));
  const relocateAttempts = Math.max(8, Math.round(clampNum(spawnCfg.relocate_attempts, 24)));
  const relocateRadiusCells = Math.max(2, Math.round(clampNum(spawnCfg.relocate_radius_cells, 4)));

  const goalCfg = spawnCfg.goal_pressure || {};
  const goalPressureRadius = clampNum(goalCfg.radius_cells, 4) * cellSize;
  const goalFactor = clampNum(goalCfg.factor, 1.8);
  const goalExtraBatch = Math.max(0, Math.round(clampNum(goalCfg.extra_batch, 1)));

  const finalCfg = spawnCfg.final_phase || {};
  const finalFactor = clampNum(finalCfg.factor, 2.6);
  const finalExtraBatch = Math.max(0, Math.round(clampNum(finalCfg.extra_batch, 2)));

  const diffSpawns = difficulty?.multiplicadores?.spawns || {};
  const densityMult = clampNum(diffSpawns.densidad_enemigos, 1);
  const countMult = clampNum(diffSpawns.numero_enemigos, 1);
  const spawnIntensity = Math.max(0.45, (densityMult * 0.7) + (countMult * 0.3));
  const intervalMs = Math.max(250, Math.round(baseIntervalMs / spawnIntensity));
  const spawnBatch = Math.max(1, Math.round(spawnBatchBase * Math.max(0.6, countMult)));

  const openCells = collectOpenCells(map, width, height);

  let lastSpawnAt = 0;
  let lastDespawnAt = 0;

  const baseMaxActive = Math.max(maxActiveBase, Math.round(worldArea / maxActiveAreaDiv));
  const scaledMaxActive = Math.max(4, Math.round(baseMaxActive * densityMult * countMult));

  function clear() {
    enemyEntities.forEach((enemy) => {
      if (enemy?.el) enemy.el.parentNode?.removeChild(enemy.el);
    });
    enemyEntities.length = 0;
  }

  function pickSpawnCellFallback(minDistLocal, attemptsLocal = fallbackAttempts) {
    if (!openCells.length) return null;
    const playerPos = getPlayerPosition();
    if (!playerPos) return null;
    const playerCell = worldToCell(playerPos, cellSize);
    for (let i = 0; i < attemptsLocal; i++) {
      const cell = openCells[Math.floor(Math.random() * openCells.length)];
      const dx = cell.x - playerCell.x;
      const dy = cell.y - playerCell.y;
      const dist = Math.hypot(dx, dy) * cellSize;
      if (dist < minDistLocal) continue;
      if (collisionSystem?.collidesAt) {
        const spawnX = cell.x * cellSize;
        const spawnZ = cell.y * cellSize;
        if (collisionSystem.collidesAt(spawnX, 0, spawnZ, cellSize * 0.28, cellSize * 0.9)) continue;
      }
      return cell;
    }
    return null;
  }

  function pickSpawnCellAroundPlayer(minDistLocal = minDist, maxDistLocal = maxDist, attemptsLocal = spawnAttempts) {
    const playerPos = getPlayerPosition();
    if (!playerPos) return null;
    const maxRange = Math.max(minDistLocal + 0.1, maxDistLocal);
    for (let i = 0; i < attemptsLocal; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDistLocal + Math.random() * (maxRange - minDistLocal);
      const wx = playerPos.x + Math.cos(angle) * dist;
      const wz = playerPos.z + Math.sin(angle) * dist;
      const cell = worldToCell({ x: wx, z: wz }, cellSize);
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
      if (isWall(map, width, height, cell.x, cell.y)) continue;
      if (collisionSystem?.collidesAt) {
        const spawnX = cell.x * cellSize;
        const spawnZ = cell.y * cellSize;
        if (collisionSystem.collidesAt(spawnX, 0, spawnZ, cellSize * 0.28, cellSize * 0.9)) continue;
      }
      const playerCell = worldToCell(playerPos, cellSize);
      const dx = cell.x - playerCell.x;
      const dy = cell.y - playerCell.y;
      const distCells = Math.hypot(dx, dy) * cellSize;
      if (distCells < minDistLocal) continue;
      if (nearEnemyDist && enemyEntities.length) {
        let tooClose = false;
        for (const enemy of enemyEntities) {
          const epos = enemy?.el?.object3D?.position;
          if (!epos) continue;
          const d = Math.hypot(epos.x - wx, epos.z - wz);
          if (d < nearEnemyDist) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
      }
      return cell;
    }
    return pickSpawnCellFallback(minDistLocal * 0.9, attemptsLocal);
  }

  function spawnBatchEnemies(count, minDistLocal, maxDistLocal) {
    for (let i = 0; i < count; i++) {
      const cell = pickSpawnCellAroundPlayer(minDistLocal, maxDistLocal);
      if (!cell) break;
      const id = enemyIds[Math.floor(Math.random() * enemyIds.length)];
      const enemy = spawnEnemy({ id, x: cell.x, y: cell.y });
      if (enemy) enemy.spawnedAt = performance.now();
    }
  }

  function relocateEnemy(enemy, now) {
    if (!enemy?.el || !openCells.length) return false;
    const pos = enemy.el.object3D.position;
    const origin = worldToCell(pos, cellSize);
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < relocateAttempts; i++) {
      const cell = openCells[Math.floor(Math.random() * openCells.length)];
      const dx = cell.x - origin.x;
      const dy = cell.y - origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > relocateRadiusCells) continue;
      const wx = cell.x * cellSize;
      const wz = cell.y * cellSize;
      if (collisionSystem?.collidesAt) {
        const radius = enemy.hitRadius || (cellSize * 0.28);
        if (collisionSystem.collidesAt(wx, 0, wz, radius, cellSize * 0.9)) continue;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }
    if (!best) return false;
    pos.x = best.x * cellSize;
    pos.z = best.y * cellSize;
    enemy._stuckFor = 0;
    enemy._lastPos = pos.clone();
    enemy._lastCheckAt = now;
    return true;
  }

  function despawnFarEnemies(now) {
    if (now - lastDespawnAt < despawnCheckMs) return;
    lastDespawnAt = now;
    const playerPos = getPlayerPosition();
    if (!playerPos) return;
    const survivors = [];
    enemyEntities.forEach((enemy) => {
      if (enemy?.dead) {
        survivors.push(enemy);
        return;
      }
      const pos = enemy.el?.object3D?.position;
      if (!pos) return;
      const dist = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      const stuckPrev = enemy._lastPos || pos.clone();
      const moved = Math.hypot(pos.x - stuckPrev.x, pos.z - stuckPrev.z);
      enemy._lastPos = pos.clone();
      const dtMs = Math.max(1, now - (enemy._lastCheckAt || now));
      enemy._lastCheckAt = now;
      if (moved < 0.08) {
        enemy._stuckFor = (enemy._stuckFor || 0) + dtMs;
      } else {
        enemy._stuckFor = 0;
      }
      const stuckTooLong = (enemy._stuckFor || 0) > despawnStuckMs;
      const insideWall = despawnInsideWall && collisionSystem?.collidesAt
        ? collisionSystem.collidesAt(pos.x, pos.y || 0, pos.z, enemy.hitRadius || (cellSize * 0.28), cellSize * 0.9)
        : false;
      const ageMs = now - (enemy.spawnedAt || 0);
      const canDespawn = ageMs > spawnGraceMs;
      if (insideWall || stuckTooLong) {
        if (relocateEnemy(enemy, now)) {
          survivors.push(enemy);
          return;
        }
        if (!canDespawn) {
          survivors.push(enemy);
          return;
        }
      }
      if (dist > despawnDist && canDespawn) {
        enemy._removed = true;
        enemy.el.parentNode?.removeChild(enemy.el);
      } else {
        survivors.push(enemy);
      }
    });
    enemyEntities.length = 0;
    survivors.forEach((e) => enemyEntities.push(e));
  }

  function spawnEnemiesFar() {
    const farMin = Math.max(minDist * 1.4, maxDist * 0.8);
    const farMax = Math.max(farMin + cellSize * 2, despawnDist * 0.8);
    const targetCount = Math.min(scaledMaxActive, Math.max(8, Math.round(scaledMaxActive * 0.5)));
    spawnBatchEnemies(targetCount, farMin, farMax);
  }

  function update(now, { finalPhase = false } = {}) {
    const playerPos = getPlayerPosition();
    if (!playerPos || !enemyIds?.length) return;
    const goalCell = getGoalCell?.();
    let pressureFactor = 1;
    let extraBatch = 0;
    if (goalCell) {
      const goalWorld = { x: goalCell.x * cellSize, z: goalCell.y * cellSize };
      const distToGoal = Math.hypot(playerPos.x - goalWorld.x, playerPos.z - goalWorld.z);
      if (distToGoal <= goalPressureRadius) {
        pressureFactor = Math.max(pressureFactor, goalFactor);
        extraBatch = Math.max(extraBatch, goalExtraBatch);
      }
    }
    if (finalPhase) {
      pressureFactor = Math.max(pressureFactor, finalFactor);
      extraBatch = Math.max(extraBatch, finalExtraBatch);
    }

    const activeCount = enemyEntities.reduce((acc, enemy) => (enemy?.dead ? acc : acc + 1), 0);
    const maxActiveNow = Math.round(scaledMaxActive * pressureFactor);
    if (activeCount < maxActiveNow) {
      const interval = intervalMs / pressureFactor;
      if (now - lastSpawnAt >= interval) {
        lastSpawnAt = now;
        const toSpawn = Math.min(spawnBatch + extraBatch, maxActiveNow - activeCount);
        spawnBatchEnemies(toSpawn, minDist, maxDist);
      }
    }

    despawnFarEnemies(now);
  }

  return {
    update,
    clear,
    spawnEnemiesFar,
  };
}
