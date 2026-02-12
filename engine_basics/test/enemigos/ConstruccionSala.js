/* construccion de la sala */

// Requiere: configuracionDatos.js para acceso a variables globales

/**
 * Agrega un muro en la posición especificada de la cuadrícula
 * @param {number} ix - Índice X en la cuadrícula de la sala
 * @param {number} iz - Índice Z en la cuadrícula de la sala
 */
function addWall(ix, iz) {
  // Ajusta la posición en los bordes
  const shiftX = (ix === 0) ? WALL_EDGE_SHIFT : (ix === ROOM_W - 1) ? -WALL_EDGE_SHIFT : 0;
  const shiftZ = (iz === 0) ? WALL_EDGE_SHIFT : (iz === ROOM_D - 1) ? -WALL_EDGE_SHIFT : 0;
  
  // Calcula posición en el mundo
  const wxCell = (ix * CELL_SIZE) - halfW + shiftX;
  const wzCell = (iz * CELL_SIZE) - halfD + shiftZ;
  
  // Rotación y ajuste del modelo
  const yaw = FULL_ADJ.rotY || 0;
  const rad = yaw * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = FULL_ADJ.pos.x;
  const oz = FULL_ADJ.pos.z;
  const rx = (ox * cos) + (oz * sin);
  const rz = (-ox * sin) + (oz * cos);
  
  const wx = wxCell;
  const wz = wzCell;
  
  // Crea el muro en capas verticales
  for (let layer = 0; layer < WALL_LAYERS; layer++) {
    const holder = document.createElement('a-entity');
    const wy = baseY + (layer * BLOCK_SIZE);
    holder.setAttribute('position', `${wx} ${wy} ${wz}`);
    
    const model = document.createElement('a-entity');
    model.setAttribute('gltf-model', '#mdl-full');
    model.setAttribute('position', `${rx} ${FULL_ADJ.pos.y} ${rz}`);
    model.setAttribute('rotation', `0 ${yaw} 0`);
    model.setAttribute('scale', `${MODEL_SCALE} ${MODEL_SCALE} ${MODEL_SCALE}`);
    
    holder.appendChild(model);
    roomEl.appendChild(holder);
  }
  
  // Agrega el collider para este muro
  const half = BLOCK_SIZE * 0.5;
  const colliderX = wxCell;
  const colliderZ = wzCell;
  const colliderMinY = 0;
  
  colliders.push({
    minX: colliderX - half,
    maxX: colliderX + half,
    minZ: colliderZ - half,
    maxZ: colliderZ + half,
    minY: colliderMinY,
    maxY: colliderMinY + wallHeight,
  });
}

/**
 * Construye la sala completa con muros en el perímetro
 */
function buildRoom() {
  // Limpia sala anterior
  roomEl.innerHTML = '';
  colliders.length = 0;
  
  // Configura el piso
  floorEl.setAttribute('width', ROOM_W * CELL_SIZE);
  floorEl.setAttribute('height', ROOM_D * CELL_SIZE);
  floorEl.setAttribute('position', '0 0 0');
  
  // Construye muros horizontales (norte y sur)
  for (let x = 0; x < ROOM_W; x++) {
    addWall(x, 0);              // Norte
    addWall(x, ROOM_D - 1);     // Sur
  }
  
  // Construye muros verticales (este y oeste), sin esquinas
  for (let z = 1; z < ROOM_D - 1; z++) {
    addWall(0, z);              // Oeste
    addWall(ROOM_W - 1, z);     // Este
  }
}