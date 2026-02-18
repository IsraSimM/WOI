import { MapGenerator, CELL } from '../generation/world_generation/map.js';
import { fetchJson } from '../data/json_loader.js';
import { generateSpawnPoints, buildSpawnData } from '../generation/world_generation/spawns.js';
import { createWorldState } from './world_state.js';

function normalizeMapData(data) {
  if (!data) return null;
  const width = Number(data.width) || 0;
  const height = Number(data.height) || 0;
  const map = Array.isArray(data.map) ? new Uint8Array(data.map) : null;
  return { map, width, height, meta: data.meta || {} };
}

export async function loadWorld({
  worldUrl,
  entitiesUrl,
  playersUrl,
  width = 21,
  height = 21,
  seed = null,
  pacmanize = false,
  openBorders = false,
  itemIds = [],
  enemyIds = [],
  itemsCount = 6,
  enemiesCount = 1,
} = {}) {
  let mapData = null;
  if (worldUrl) {
    const raw = await fetchJson(worldUrl);
    mapData = normalizeMapData(raw);
  }

  if (!mapData || !mapData.map) {
    const gen = new MapGenerator(width, height, { seed });
    gen.generateMaze({ ensureBorderWalls: true });
    gen.autoPlaceGoals({ markCells: true });
    if (pacmanize) {
      gen.pacmanizeMap({ openBorders: !!openBorders, protectGoals: true });
    } else if (openBorders) {
      gen.openBorders();
    }
    mapData = {
      map: gen.getMap(),
      width: gen.width,
      height: gen.height,
      meta: gen.meta,
    };
  }

  let entities = { items: [], enemies: [] };
  if (entitiesUrl) {
    try {
      entities = await fetchJson(entitiesUrl);
    } catch {
      entities = { items: [], enemies: [] };
    }
  }

  let players = { spawn: null, mode: 'modo_classic', difficulty: 'normal' };
  if (playersUrl) {
    try {
      players = await fetchJson(playersUrl);
    } catch {
      players = { spawn: null, mode: 'modo_classic', difficulty: 'normal' };
    }
  }

  const avoid = new Set();
  if (mapData.meta?.start) avoid.add(`${mapData.meta.start.x},${mapData.meta.start.y}`);
  if (mapData.meta?.end) avoid.add(`${mapData.meta.end.x},${mapData.meta.end.y}`);

  if (!entities.items?.length && itemIds.length) {
    const pts = generateSpawnPoints(mapData.map, mapData.width, mapData.height, itemsCount, { avoid });
    entities.items = buildSpawnData(pts, itemIds);
  }

  if (!entities.enemies?.length && enemyIds.length) {
    const pts = generateSpawnPoints(mapData.map, mapData.width, mapData.height, enemiesCount, { avoid });
    entities.enemies = buildSpawnData(pts, enemyIds);
  }

  const playerSpawn = players.spawn || mapData.meta?.start || { x: 1, y: 1 };

  return createWorldState({
    map: mapData.map,
    width: mapData.width,
    height: mapData.height,
    meta: mapData.meta,
    items: entities.items || [],
    enemies: entities.enemies || [],
    playerSpawn,
    mode: players.mode || 'modo_classic',
    difficulty: players.difficulty || 'normal',
  });
}

export function cellToWorld({ x, y }, cellSize, height = 0) {
  return {
    x: x * cellSize,
    y: height,
    z: y * cellSize,
  };
}

export function worldToCell({ x, z }, cellSize) {
  return {
    x: Math.round(x / cellSize),
    y: Math.round(z / cellSize),
  };
}

export function isWall(map, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return true;
  return map[y * width + x] === CELL.WALL;
}
