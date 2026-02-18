import { resolveGameUrl } from '../../data/paths.js';

function cellToWorld(cell, cellSize) {
  return {
    x: cell.x * cellSize,
    y: 0,
    z: cell.y * cellSize,
  };
}

export function createItemSystem({ sceneEl, itemsData, worldState, cellSize, onPickup, shadowEnabled = false }) {
  const itemsById = new Map();
  itemsData.forEach((item) => itemsById.set(item.id, item));
  const initialEntries = (worldState.items || []).map((entry) => ({ ...entry }));

  const TRAP_MASK_COLOR = '#ff4d6d';
  const TRAP_MASK_STRENGTH = 0.35;

  function isTrapItem(def) {
    const id = String(def?.id || '');
    if (id.startsWith('trap_') || id.endsWith('_trap')) return true;
    return def?.tipo_efecto === 'trampa';
  }

  function applyColorMask(mesh, colorHex, strength = 0.3) {
    if (!mesh || !window.THREE) return;
    const mask = new THREE.Color(colorHex || '#ff4d6d');
    mesh.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((mat) => {
        if (!mat || !mat.color) return;
        if (!mat.userData) mat.userData = {};
        if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
        mat.color.copy(mat.userData.baseColor).lerp(mask, strength);
        if ('emissive' in mat) {
          if (!mat.userData.baseEmissive) mat.userData.baseEmissive = (mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000));
          mat.emissive.copy(mat.userData.baseEmissive).lerp(mask, strength * 0.35);
        }
        mat.needsUpdate = true;
      });
    });
  }

  function normalizeTrapMaterial(mesh) {
    if (!mesh || !window.THREE) return;
    mesh.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const next = mats.map((mat) => {
        if (!mat || mat.isMeshStandardMaterial) return mat;
        if (!mat.isMeshBasicMaterial && !mat.isMeshLambertMaterial && !mat.isMeshPhongMaterial) return mat;
        const std = new THREE.MeshStandardMaterial({
          map: mat.map || null,
          color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
          transparent: Boolean(mat.transparent),
          opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
          alphaTest: Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0,
          side: mat.side,
          metalness: 0.1,
          roughness: 0.8,
        });
        if (mat.emissive) std.emissive = mat.emissive.clone();
        if (mat.emissiveMap) std.emissiveMap = mat.emissiveMap;
        if (mat.normalMap) std.normalMap = mat.normalMap;
        if (mat.roughnessMap) std.roughnessMap = mat.roughnessMap;
        if (mat.metalnessMap) std.metalnessMap = mat.metalnessMap;
        if (mat.aoMap) std.aoMap = mat.aoMap;
        if (mat.alphaMap) std.alphaMap = mat.alphaMap;
        std.needsUpdate = true;
        return std;
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
  }

  function spawnEntry(entry) {
    const def = itemsById.get(entry.id);
    if (!def) return null;
    const rootEl = document.createElement('a-entity');
    rootEl.classList.add('pickup-item');
    if (shadowEnabled) {
      rootEl.setAttribute('shadow', 'cast: true; receive: false');
    }
    const pos = cellToWorld(entry, cellSize);
    const yOffset = Number(def.yOffset) || 0;
    const baseY = cellSize * 0.25;
    rootEl.setAttribute('position', `${pos.x} ${baseY + yOffset} ${pos.z}`);

    const bobEl = document.createElement('a-entity');
    const bobHeight = Math.max(0.08, cellSize * 0.08);
    const bobDur = 1600 + Math.floor(Math.random() * 900);
    bobEl.setAttribute(
      'animation__float',
      `property: position; dir: alternate; dur: ${bobDur}; easing: easeInOutSine; loop: true; to: 0 ${bobHeight} 0`,
    );
    rootEl.appendChild(bobEl);

    const modelEl = document.createElement('a-entity');
    if (def.asset) {
      modelEl.setAttribute('gltf-model', resolveGameUrl(def.asset));
      const scale = def.scale ?? 0.6;
      modelEl.setAttribute('scale', `${scale} ${scale} ${scale}`);
      modelEl.addEventListener('model-loaded', () => {
        const mesh = modelEl.getObject3D('mesh');
        if (!mesh || !window.THREE) return;
        if (isTrapItem(def)) {
          normalizeTrapMaterial(mesh);
          applyColorMask(mesh, TRAP_MASK_COLOR, TRAP_MASK_STRENGTH);
        }
      }, { once: true });
    } else {
      modelEl.setAttribute('geometry', 'primitive: sphere; radius: 0.2');
      modelEl.setAttribute('material', `color: ${def.color || '#ffb8d1'}`);
    }
    bobEl.appendChild(modelEl);
    sceneEl.appendChild(rootEl);
    return { def, el: rootEl, picked: false, cell: entry };
  }

  const spawned = (worldState.items || []).map(spawnEntry).filter(Boolean);

  function update() {
    // No auto-pickup; handled by user input.
  }

  function findNearest(playerPos, radius = cellSize * 0.5) {
    if (!playerPos) return null;
    let best = null;
    let bestDist = Infinity;
    for (const item of spawned) {
      if (item.picked) continue;
      const pos = item.el.object3D.position;
      const dist = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (dist <= radius && dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }

  function pickup(item) {
    if (!item || item.picked) return false;
    item.picked = true;
    item.el.parentNode?.removeChild(item.el);
    if (Array.isArray(worldState.items)) {
      worldState.items = worldState.items.filter((entry) => entry !== item.cell);
    }
    if (typeof onPickup === 'function') onPickup(item.def);
    return true;
  }

  function getRemaining() {
    return spawned
      .filter((item) => !item.picked)
      .map((item) => ({ id: item.def.id, x: item.cell.x, y: item.cell.y }));
  }

  function reset() {
    spawned.forEach((item) => {
      if (!item?.el) return;
      item.el.parentNode?.removeChild(item.el);
    });
    spawned.length = 0;
    worldState.items = initialEntries.map((entry) => ({ ...entry }));
    const fresh = (worldState.items || []).map(spawnEntry).filter(Boolean);
    fresh.forEach((item) => spawned.push(item));
  }

  return { items: spawned, update, getRemaining, findNearest, pickup, reset };
}
