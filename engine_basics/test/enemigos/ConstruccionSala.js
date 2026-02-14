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
  const colliderX = wxCell + COLLIDER_ADJ.x;
  const colliderZ = wzCell + COLLIDER_ADJ.z;
  const colliderMinY = COLLIDER_ADJ.y;
  
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

/**
 * Construye un mini escenario de prueba alrededor del spawn
 * Arena pequeña de 5x5 con 2 bloques de altura y una salida al sur
 */
function buildMiniArena() {
  // Limpia sala anterior
  roomEl.innerHTML = '';
  colliders.length = 0;
  
  // Configura el piso para una arena de 5x5 centrada
  const arenaSize = 5;
  floorEl.setAttribute('width', arenaSize * CELL_SIZE);
  floorEl.setAttribute('height', arenaSize * CELL_SIZE);
  floorEl.setAttribute('position', '0 0 0');
  
  // Calcula posiciones para centrar la arena (0 a 4, con centro en 2)
  const start = 2; // Centro de la arena de 5x5
  
  // Muro norte (completo) - fila 0
  for (let x = 0; x < 5; x++) {
    addWall(x, 0);
  }
  
  // Muro sur con apertura en el centro - fila 4
  addWall(0, 4);  // Oeste
  addWall(1, 4);  // Medio-oeste
  // x=2 es la apertura (salida)
  addWall(3, 4);  // Medio-este
  addWall(4, 4);  // Este
  
  // Muros laterales (columnas 0 y 4)
  for (let z = 1; z < 4; z++) {
    addWall(0, z);  // Muro oeste
    addWall(4, z);  // Muro este
  }
}