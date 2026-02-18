import { CELL } from './map.js';

function isWalkable(v) {
  return v !== CELL.WALL;
}

export function collectOpenCells(map, width, height, { avoid = new Set() } = {}) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!isWalkable(map[idx])) continue;
      const key = `${x},${y}`;
      if (avoid.has(key)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

export function pickRandomCells(cells, count, rand = Math.random) {
  if (!cells.length) return [];
  const out = [];
  const pool = cells.slice();
  while (pool.length && out.length < count) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function generateSpawnPoints(map, width, height, count, { avoid = new Set(), rand = Math.random } = {}) {
  const open = collectOpenCells(map, width, height, { avoid });
  return pickRandomCells(open, count, rand);
}

export function buildSpawnData(points, ids) {
  const out = [];
  if (!points?.length) return out;
  for (let i = 0; i < points.length; i++) {
    const id = ids[i % ids.length];
    out.push({ id, x: points[i].x, y: points[i].y });
  }
  return out;
}
