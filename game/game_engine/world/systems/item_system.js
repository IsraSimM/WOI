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

  const spawned = worldState.items.map((entry) => {
    const def = itemsById.get(entry.id);
    if (!def) return null;
    const el = document.createElement('a-entity');
    el.classList.add('pickup-item');
    if (shadowEnabled) {
      el.setAttribute('shadow', 'cast: true; receive: false');
    }
    const pos = cellToWorld(entry, cellSize);
    const yOffset = Number(def.yOffset) || 0;
    const baseY = cellSize * 0.2;
    el.setAttribute('position', `${pos.x} ${baseY + yOffset} ${pos.z}`);
    if (def.asset) {
      el.setAttribute('gltf-model', resolveGameUrl(def.asset));
      const scale = def.scale ?? 0.6;
      el.setAttribute('scale', `${scale} ${scale} ${scale}`);
      el.addEventListener('model-loaded', () => {
        const mesh = el.getObject3D('mesh');
        if (!mesh || !window.THREE) return;
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const targetX = pos.x;
        const targetZ = pos.z;
        const targetBottom = baseY + yOffset;
        el.object3D.position.x += targetX - center.x;
        el.object3D.position.z += targetZ - center.z;
        el.object3D.position.y += targetBottom - box.min.y;
      }, { once: true });
    } else {
      el.setAttribute('geometry', 'primitive: sphere; radius: 0.2');
      el.setAttribute('material', `color: ${def.color || '#ffb8d1'}`);
    }
    sceneEl.appendChild(el);
    return { def, el, picked: false, cell: entry };
  }).filter(Boolean);

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

  return { items: spawned, update, getRemaining, findNearest, pickup };
}
