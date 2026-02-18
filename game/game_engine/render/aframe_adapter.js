import { CELL } from '../core/constants.js';
import { resolveGameUrl } from '../data/paths.js';
import { ensureAssets } from './asset_cache.js';

const DIRS = ['N', 'E', 'S', 'W'];
const SIDE = { N: 1, E: 2, S: 4, W: 8 };
const ROTATE_CW = { [SIDE.N]: SIDE.E, [SIDE.E]: SIDE.S, [SIDE.S]: SIDE.W, [SIDE.W]: SIDE.N };

function rotateDir(dir, steps) {
  const idx = DIRS.indexOf(dir);
  return DIRS[(idx + steps + DIRS.length) % DIRS.length];
}

function stepsBetween(baseDir, targetDir) {
  const baseIdx = DIRS.indexOf(baseDir);
  const targetIdx = DIRS.indexOf(targetDir);
  return (targetIdx - baseIdx + DIRS.length) % DIRS.length;
}

function getCalibration() {
  try {
    const raw = localStorage.getItem('mazeAssetCalibration');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeAdjust(adjust = {}, cellSize = 6) {
  const clamp = (value, maxAbs) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.abs(n) > maxAbs ? 0 : n;
  };
  const safe = {};
  const keys = ['unilateral', 'bilateral', 'corner', 'trilateral', 'full'];
  const maxAbs = Math.max(1, cellSize);
  keys.forEach((key) => {
    const entry = adjust?.[key] || {};
    const pos = entry.pos || {};
    safe[key] = {
      pos: {
        x: clamp(pos.x, maxAbs),
        y: clamp(pos.y, maxAbs),
        z: clamp(pos.z, maxAbs),
      },
      rotY: Number.isFinite(entry.rotY) ? entry.rotY : 0,
      scale: Number.isFinite(entry.scale) ? entry.scale : 1,
    };
  });
  return safe;
}

function rotateMask(mask, steps) {
  let m = mask;
  for (let i = 0; i < steps; i++) {
    let next = 0;
    if (m & SIDE.N) next |= ROTATE_CW[SIDE.N];
    if (m & SIDE.E) next |= ROTATE_CW[SIDE.E];
    if (m & SIDE.S) next |= ROTATE_CW[SIDE.S];
    if (m & SIDE.W) next |= ROTATE_CW[SIDE.W];
    m = next;
  }
  return m;
}

function yawForMask(mask, baseMask, offset = 0) {
  for (let k = 0; k < 4; k++) {
    if (rotateMask(baseMask, k) === mask) return (-k * 90) + offset;
  }
  return offset;
}

function maskFromString(value, fallback) {
  const raw = String(value ?? '').toUpperCase();
  let mask = 0;
  for (const ch of raw) {
    if (SIDE[ch]) mask |= SIDE[ch];
  }
  return mask || fallback;
}

function baseMaskForCorner(label) {
  const raw = String(label ?? 'NW').toUpperCase();
  if (raw === 'NE') return SIDE.N | SIDE.E;
  if (raw === 'SE') return SIDE.S | SIDE.E;
  if (raw === 'SW') return SIDE.S | SIDE.W;
  return SIDE.N | SIDE.W;
}

function parseTrilateralBase(value) {
  const raw = String(value ?? '').toUpperCase();
  let openMask = 0;
  if (raw.length === 1 && SIDE[raw]) {
    openMask = (SIDE.N | SIDE.E | SIDE.S | SIDE.W) & ~SIDE[raw];
  } else {
    for (const ch of raw) {
      if (SIDE[ch]) openMask |= SIDE[ch];
    }
  }
  if (!openMask) openMask = SIDE.N | SIDE.E | SIDE.S;
  return openMask;
}

function wallMask(map, width, height, x, y) {
  const isWall = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
    return map[ny * width + nx] === CELL.WALL;
  };
  const openN = !isWall(x, y - 1);
  const openS = !isWall(x, y + 1);
  const openW = !isWall(x - 1, y);
  const openE = !isWall(x + 1, y);
  let mask = 0;
  if (openN) mask |= SIDE.N;
  if (openE) mask |= SIDE.E;
  if (openS) mask |= SIDE.S;
  if (openW) mask |= SIDE.W;
  return { mask, openCount: (openN + openE + openS + openW) };
}

function modelFor(map, width, height, x, y, base) {
  const idx = y * width + x;
  if (map[idx] !== CELL.WALL) return null;
  const { mask, openCount } = wallMask(map, width, height, x, y);
  if (openCount === 0) return { key: 'full', yaw: 0 };
  if (openCount === 1) {
    const baseMask = maskFromString(base?.unilateral, SIDE.N);
    return { key: 'unilateral', yaw: yawForMask(mask, baseMask, 0) };
  }
  if (openCount === 2) {
    const straight = (mask === (SIDE.N | SIDE.S)) || (mask === (SIDE.E | SIDE.W));
    if (straight) {
      const baseMask = maskFromString(base?.bilateral, SIDE.N | SIDE.S);
      return { key: 'bilateral', yaw: yawForMask(mask, baseMask, 0) };
    }
    const baseMask = baseMaskForCorner(base?.corner || 'NW');
    return { key: 'corner', yaw: yawForMask(mask, baseMask, 0) };
  }
  if (openCount === 3) {
    const baseMask = parseTrilateralBase(base?.trilateral || 'WEN');
    return { key: 'trilateral', yaw: yawForMask(mask, baseMask, 0) };
  }
  if (openCount === 4) return { key: 'full', yaw: 0 };
  return null;
}

function autoAlignEntity(el, { x, z, bottom }) {
  el.addEventListener('model-loaded', () => {
    const mesh = el.getObject3D('mesh');
    if (!mesh || !window.THREE) return;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const dx = x - center.x;
    const dz = z - center.z;
    const dy = bottom - box.min.y;
    el.object3D.position.x += dx;
    el.object3D.position.y += dy;
    el.object3D.position.z += dz;
    el.object3D.updateMatrixWorld(true);
  }, { once: true });
}

export function buildWorldScene({
  sceneEl,
  map,
  width,
  height,
  cellSize = 6,
  wallHeight = 2,
  meta = {},
  shadowsEnabled = false,
} = {}) {
  const calibration = getCalibration() || {};
  const assetSize = Number(calibration.assetSize) || 6;
  const wallScale = Number(calibration.wallScale) || 1;
  const assetOrigin = calibration.assetOrigin === 'base' ? 'base' : 'center';
  const base = calibration.base || {};
  const adjust = sanitizeAdjust(calibration.adjust || {}, cellSize);

  const blockScale = (cellSize / assetSize) * wallScale;
  const blockHeight = cellSize * wallScale;
  const floorSizeX = width * cellSize;
  const floorSizeZ = height * cellSize;
  const floorPosX = (width - 1) * cellSize * 0.5;
  const floorPosZ = (height - 1) * cellSize * 0.5;
  const blockBaseY = assetOrigin === 'center' ? (blockHeight * 0.5) : 0;

  ensureAssets(sceneEl, [
    { id: 'mdl-unilateral', src: resolveGameUrl('game_data/assets/blocks/unilateral.glb') },
    { id: 'mdl-bilateral', src: resolveGameUrl('game_data/assets/blocks/bilateral.glb') },
    { id: 'mdl-corner', src: resolveGameUrl('game_data/assets/blocks/bilateral_corner.glb') },
    { id: 'mdl-trilateral', src: resolveGameUrl('game_data/assets/blocks/trilateral.glb') },
    { id: 'mdl-full', src: resolveGameUrl('game_data/assets/blocks/full.glb') },
  ]);

  const worldRoot = document.createElement('a-entity');
  worldRoot.setAttribute('id', 'world');

  const floor = document.createElement('a-plane');
  floor.setAttribute('width', floorSizeX);
  floor.setAttribute('height', floorSizeZ);
  floor.setAttribute('rotation', '-90 0 0');
  floor.setAttribute('position', `${floorPosX} 0 ${floorPosZ}`);
  floor.setAttribute('color', '#10141a');
  floor.setAttribute('material', 'roughness: 1; metalness: 0');
  if (shadowsEnabled) {
    floor.setAttribute('shadow', 'receive: true');
  }
  worldRoot.appendChild(floor);

  const addMarker = ({ id, x, z, color, label }) => {
    const group = document.createElement('a-entity');
    group.setAttribute('id', id);

    const ring = document.createElement('a-ring');
    ring.setAttribute('radius-inner', cellSize * 0.16);
    ring.setAttribute('radius-outer', cellSize * 0.26);
    ring.setAttribute('rotation', '-90 0 0');
    ring.setAttribute('position', `${x} 0.05 ${z}`);
    ring.setAttribute('material', `color: ${color}; emissive: ${color}; emissiveIntensity: 0.6; metalness: 0.2; roughness: 0.3`);
    group.appendChild(ring);

    const pillar = document.createElement('a-cylinder');
    pillar.setAttribute('radius', cellSize * 0.05);
    pillar.setAttribute('height', cellSize * 0.6);
    pillar.setAttribute('position', `${x} ${cellSize * 0.3} ${z}`);
    pillar.setAttribute('material', `color: ${color}; emissive: ${color}; emissiveIntensity: 0.35; metalness: 0.2; roughness: 0.4`);
    group.appendChild(pillar);

    if (label) {
      const text = document.createElement('a-entity');
      text.setAttribute('text', `value: ${label}; align: center; color: ${color}; width: ${cellSize * 2};`);
      text.setAttribute('position', `${x} ${cellSize * 0.8} ${z}`);
      text.setAttribute('rotation', '0 180 0');
      group.appendChild(text);
    }

    worldRoot.appendChild(group);
  };

  const startCell = meta?.start;
  const endCell = meta?.end || meta?.exit;
  if (startCell && Number.isFinite(startCell.x) && Number.isFinite(startCell.y)) {
    addMarker({
      id: 'marker-start',
      x: startCell.x * cellSize,
      z: startCell.y * cellSize,
      color: '#37f2a8',
      label: 'INICIO',
    });
  }
  if (endCell && Number.isFinite(endCell.x) && Number.isFinite(endCell.y)) {
    addMarker({
      id: 'marker-end',
      x: endCell.x * cellSize,
      z: endCell.y * cellSize,
      color: '#ff6b5c',
      label: 'FINAL',
    });
  }

  const walls = [];
  const renderLayers = Math.max(1, Math.min(1, Math.round(wallHeight) || 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const model = modelFor(map, width, height, x, y, base);
      if (!model) continue;

      const type = model.key;
      const modelId = type === 'unilateral'
        ? '#mdl-unilateral'
        : type === 'bilateral'
          ? '#mdl-bilateral'
          : type === 'corner'
            ? '#mdl-corner'
            : type === 'trilateral'
              ? '#mdl-trilateral'
              : '#mdl-full';

      const baseYaw = model.yaw;
      const rot = baseYaw + (Number(adjust[type]?.rotY) || 0);
      const scaleAdj = Number(adjust[type]?.scale) || 1;
      const posAdj = adjust[type]?.pos || {};
      const rad = rot * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const ox = Number(posAdj.x) || 0;
      const oz = Number(posAdj.z) || 0;
      const rx = (ox * cos) + (oz * sin);
      const rz = (-ox * sin) + (oz * cos);

      for (let h = 0; h < renderLayers; h++) {
        const block = document.createElement('a-entity');
        block.setAttribute('gltf-model', modelId);
        if (shadowsEnabled) {
          block.setAttribute('shadow', 'cast: true; receive: true');
        }
        const posX = x * cellSize + rx;
        const posZ = y * cellSize + rz;
        const posY = blockBaseY + (h * blockHeight) + (Number(posAdj.y) || 0);
        const scale = blockScale * scaleAdj;
        block.setAttribute('position', `${posX} ${posY} ${posZ}`);
        block.setAttribute('rotation', `0 ${rot} 0`);
        block.setAttribute('scale', `${scale} ${scale} ${scale}`);
        autoAlignEntity(block, {
          x: posX,
          z: posZ,
          bottom: (h * blockHeight) + (Number(posAdj.y) || 0),
        });
        worldRoot.appendChild(block);
        walls.push(block);
      }
    }
  }

  const light = document.createElement('a-entity');
  light.setAttribute('light', 'type: ambient; intensity: 0.35; color: #9db3c7');
  worldRoot.appendChild(light);

  const dirLight = document.createElement('a-entity');
  if (shadowsEnabled) {
    dirLight.setAttribute('light', 'type: directional; intensity: 0.6; color: #ffffff; castShadow: true; shadowMapWidth: 1024; shadowMapHeight: 1024');
  } else {
    dirLight.setAttribute('light', 'type: directional; intensity: 0.6; color: #ffffff');
  }
  dirLight.setAttribute('position', `${floorPosX} ${cellSize * 6} ${floorPosZ}`);
  worldRoot.appendChild(dirLight);

  sceneEl.appendChild(worldRoot);
  return { worldRoot, walls };
}
