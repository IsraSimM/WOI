export function buildColliders(map, width, height, cellSize, wallHeight) {
  const colliders = [];
  const half = cellSize * 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (map[idx] !== 1) continue;
      const cx = x * cellSize;
      const cz = y * cellSize;
      colliders.push({
        minX: cx - half,
        maxX: cx + half,
        minZ: cz - half,
        maxZ: cz + half,
        minY: 0,
        maxY: wallHeight,
      });
    }
  }
  return colliders;
}

export function intersectsAabb(px, py, pz, radius, height, box) {
  const minX = px - radius;
  const maxX = px + radius;
  const minZ = pz - radius;
  const maxZ = pz + radius;
  const minY = py;
  const maxY = py + height;

  if (maxX <= box.minX || minX >= box.maxX) return false;
  if (maxZ <= box.minZ || minZ >= box.maxZ) return false;
  if (maxY <= box.minY || minY >= box.maxY) return false;
  return true;
}

export function collidesAt(px, py, pz, radius, height, colliders) {
  for (const box of colliders) {
    if (intersectsAabb(px, py, pz, radius, height, box)) return true;
  }
  return false;
}

export function createCollisionSystem(map, width, height, cellSize, wallHeight) {
  const colliders = buildColliders(map, width, height, cellSize, wallHeight);
  const minX = 0;
  const minZ = 0;
  const maxX = (width - 1) * cellSize;
  const maxZ = (height - 1) * cellSize;

  const outOfBounds = (px, pz, radius) =>
    (px - radius) < minX || (px + radius) > maxX || (pz - radius) < minZ || (pz + radius) > maxZ;

  return {
    colliders,
    collidesAt: (px, py, pz, radius, h) => {
      if (outOfBounds(px, pz, radius)) return true;
      return collidesAt(px, py, pz, radius, h, colliders);
    },
  };
}
