/* Sistema de items - recolección, inventario y HUD */

// Requiere: configuracionDatos.js

/**
 * Limpia todos los items de la escena y resetea el inventario
 */
function clearItems() {
  roomEl.querySelectorAll('.pickup-item').forEach((el) => el.remove());
  itemsState.length = 0;
  inventory.length = 0;
  updateHud();
}

/**
 * Muestra un mensaje de estado en el HUD
 * @param {string} text - Texto a mostrar
 * @param {boolean} warn - Si es true, muestra como advertencia
 */
function setStatus(text, warn = false) {
  if (!statusEl) return;
  
  statusEl.textContent = text;
  statusEl.style.color = warn ? '#f97316' : 'var(--muted)';
  
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  
  if (warn) {
    statusTimer = setTimeout(() => {
      statusEl.textContent = 'E para recoger';
      statusEl.style.color = 'var(--muted)';
    }, 2000);
  }
}

/**
 * Obtiene el límite máximo de items según el modo de juego
 * @returns {number} Número máximo de items
 */
function getMaxItems() {
  const mode = modeSelect?.value || 'normal';
  return MODE_LIMITS[mode] ?? 4;
}

/**
 * Crea una fila HTML para mostrar un item en el HUD
 * @param {Object} item - Datos del item
 * @returns {HTMLElement} Elemento DOM de la fila
 */
function renderItemRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row';
  
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = item.color || '#8892a0';
  
  const label = document.createElement('span');
  label.textContent = item.nombre || item.id || 'Item';
  
  row.appendChild(swatch);
  row.appendChild(label);
  
  return row;
}

/**
 * Actualiza todos los elementos del HUD de inventario
 */
function updateHud() {
  const maxItems = getMaxItems();
  
  if (invMaxEl) invMaxEl.textContent = String(maxItems);
  if (invMaxLabelEl) invMaxLabelEl.textContent = String(maxItems);
  if (invCountEl) invCountEl.textContent = String(inventory.length);
  
  // Actualiza lista de inventario
  if (invListEl) {
    invListEl.innerHTML = '';
    inventory.forEach((item) => invListEl.appendChild(renderItemRow(item)));
  }
  
  // Actualiza lista de items disponibles
  const available = itemsState.filter((entry) => !entry.picked).map((entry) => entry.data);
  if (availCountEl) availCountEl.textContent = String(available.length);
  
  if (availListEl) {
    availListEl.innerHTML = '';
    available.forEach((item) => availListEl.appendChild(renderItemRow(item)));
  }
}

/**
 * Encuentra el item que el jugador está mirando
 * @returns {Object|null} Entrada del item o null si no hay ninguno
 */
function findLookedItem() {
  const source = cameraEl?.object3D || headEl?.object3D;
  if (!source) return null;
  
  source.getWorldPosition(cameraWorldPos);
  source.getWorldDirection(cameraForward);
  cameraForward.normalize();
  
  let best = null;
  let bestScore = -Infinity;
  
  for (const entry of itemsState) {
    if (!entry || entry.picked || !entry.el) continue;
    
    entry.el.object3D.getWorldPosition(itemWorldPos);
    toItemDir.copy(itemWorldPos).sub(cameraWorldPos);
    
    const dist = toItemDir.length();
    if (!Number.isFinite(dist) || dist <= 0.001 || dist > ITEM_FOCUS_DISTANCE) continue;
    
    toItemDir.divideScalar(dist);
    const dot = cameraForward.dot(toItemDir);
    
    if (dot < ITEM_FOCUS_DOT) continue;
    
    const score = (dot * 2) - (dist / ITEM_FOCUS_DISTANCE);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  
  return best;
}

/**
 * Actualiza el panel de información del item enfocado
 */
function updateFocusHud() {
  if (!focusPanelEl || !focusNameEl || !focusDescEl) return;
  
  const entry = findLookedItem();
  
  if (!entry) {
    focusPanelEl.hidden = true;
    return;
  }
  
  const name = entry.data?.nombre || entry.data?.name || entry.data?.id || 'Item';
  const desc = entry.data?.descripcion || entry.data?.description || '';
  
  focusNameEl.textContent = name;
  focusDescEl.textContent = desc;
  focusDescEl.style.display = desc ? 'block' : 'none';
  focusPanelEl.hidden = false;
}

/**
 * Crea un modelo de diamante como fallback si el asset no carga
 * @param {HTMLElement} parentEl - Elemento padre donde agregar el diamante
 * @param {string} color - Color del diamante
 */
function createFallbackDiamond(parentEl, color) {
  const diamond = document.createElement('a-octahedron');
  diamond.setAttribute('radius', BLOCK_SIZE * 0.22);
  diamond.setAttribute('color', color || '#f59e0b');
  diamond.setAttribute('position', `0 ${BLOCK_SIZE * 0.2} 0`);
  diamond.setAttribute('material', 'metalness: 0.1; roughness: 0.35');
  parentEl.appendChild(diamond);
}

/**
 * Recentra el modelo 3D del item según su origen
 * @param {HTMLElement} el - Elemento que contiene el modelo
 * @param {string} origin - 'base' o 'center'
 */
function recenterItemModel(el, origin = 'base') {
  const model = el.getObject3D('mesh');
  if (!model) return;
  
  model.updateMatrixWorld(true);
  
  const box = new THREE.Box3();
  const centerWorld = new THREE.Vector3();
  const sizeWorld = new THREE.Vector3();
  let hasMesh = false;
  
  model.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    if (!node.geometry) return;
    
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    
    const nodeBox = node.geometry.boundingBox.clone();
    nodeBox.applyMatrix4(node.matrixWorld);
    box.union(nodeBox);
    hasMesh = true;
  });
  
  if (!hasMesh || box.isEmpty()) return;
  
  box.getCenter(centerWorld);
  box.getSize(sizeWorld);
  
  const maxDim = Math.max(sizeWorld.x, sizeWorld.y, sizeWorld.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return;
  if (maxDim > (BLOCK_SIZE * 10)) return;
  
  const parent = model.parent || model;
  const centerLocal = parent.worldToLocal(centerWorld.clone());
  const minLocal = parent.worldToLocal(box.min.clone());
  
  if (!Number.isFinite(centerLocal.x) || !Number.isFinite(centerLocal.y) || !Number.isFinite(centerLocal.z)) return;
  
  model.position.x -= centerLocal.x;
  model.position.z -= centerLocal.z;
  
  if (origin === 'center') {
    model.position.y -= centerLocal.y;
  } else {
    model.position.y -= minLocal.y;
  }
  
  model.updateMatrixWorld(true);
}

/**
 * Coloca items en la escena basándose en un array de configuración
 * @param {Array} items - Array de objetos con configuración de items
 */
function placeItems(items) {
  const innerCells = [];
  
  // Genera lista de celdas interiores (sin bordes)
  for (let z = 1; z < ROOM_D - 1; z++) {
    for (let x = 1; x < ROOM_W - 1; x++) {
      innerCells.push({ x, z });
    }
  }
  
  items.forEach((item, index) => {
    const cell = innerCells[index % innerCells.length];
    const x = (cell.x * CELL_SIZE) - halfW;
    const z = (cell.z * CELL_SIZE) - halfD;
    
    const entity = document.createElement('a-entity');
    const assetPath = resolveAssetPath(item.asset);
    const itemScale = ITEM_BASE_SCALE * (Number(item.scale) || 1);
    const y = ITEM_BASE_Y + ITEM_Y_OFFSET + (Number(item.yOffset) || 0);
    const xOffset = Number(item.xOffset) || 0;
    const zOffset = Number(item.zOffset) || 0;
    
    entity.setAttribute('position', `${x + xOffset} ${y} ${z + zOffset}`);
    entity.setAttribute('data-item-id', item.id || '');
    entity.setAttribute('data-item-name', item.nombre || '');
    entity.setAttribute('class', 'pickup-item');
    
    // Carga modelo 3D o usa fallback
    if (assetPath) {
      entity.setAttribute('gltf-model', assetPath);
      
      entity.addEventListener('model-loaded', () => {
        if (item?.recenter === false) return;
        const origin = (item?.origin === 'center') ? 'center' : 'base';
        recenterItemModel(entity, origin);
      }, { once: true });
      
      entity.addEventListener('model-error', () => {
        entity.removeAttribute('gltf-model');
        createFallbackDiamond(entity, item.color);
      }, { once: true });
    } else {
      createFallbackDiamond(entity, item.color);
    }
    
    entity.setAttribute('scale', `${itemScale} ${itemScale} ${itemScale}`);
    
    // Agrega etiqueta de texto
    const label = document.createElement('a-entity');
    label.setAttribute('text', `value: ${item.nombre || item.id || 'Item'}; align: center; color: #e7e3d9; width: 4`);
    label.setAttribute('position', `0 ${BLOCK_SIZE * 0.35} 0`);
    entity.appendChild(label);
    
    roomEl.appendChild(entity);
    
    itemsState.push({
      data: item,
      el: entity,
      picked: false
    });
  });
  
  updateHud();
}

/**
 * Carga items desde el archivo JSON
 */
async function loadItems() {
  try {
    clearItems();
    
    const res = await fetch(ITEMS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar items.json');
    
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('items.json invalido');
    
    placeItems(items);
  } catch (err) {
    console.error('Error cargando items:', err);
    setStatus('No se pudieron cargar items', true);
  }
}

/**
 * Intenta recoger el item más cercano
 */
function tryPickup() {
  const maxItems = getMaxItems();
  
  if (inventory.length >= maxItems) {
    setStatus('Inventario lleno', true);
    return;
  }
  
  const playerPos = document.getElementById('player').object3D.position;
  let nearest = null;
  let nearestDist = Infinity;
  
  for (const entry of itemsState) {
    if (entry.picked || !entry.el) continue;
    
    const itemPos = new THREE.Vector3();
    entry.el.object3D.getWorldPosition(itemPos);
    
    const dx = itemPos.x - playerPos.x;
    const dz = itemPos.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entry;
    }
  }
  
  if (!nearest || nearestDist > (CELL_SIZE * 0.6)) {
    setStatus('Acercate mas al item', true);
    return;
  }
  
  // Recoge el item
  nearest.picked = true;
  nearest.el.parentNode?.removeChild(nearest.el);
  inventory.push(nearest.data);
  updateHud();
}
