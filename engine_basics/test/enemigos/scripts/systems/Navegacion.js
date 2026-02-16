/* navegacion y orientacion */

// Requiere: configuracionDatos.js, Items.js (para updateFocusHud)

/**
 * Normaliza un ángulo a rango 0-360
 * @param {number} deg - Ángulo en grados
 * @returns {number} Ángulo normalizado
 */
function normalizeHeading(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Obtiene el ángulo de dirección desde la cámara
 * @returns {number} Ángulo en grados (0-360)
 */
function headingFromCamera() {
  const headingSource = cameraEl?.object3D || headEl?.object3D;
  if (!headingSource) return 0;
  
  headingSource.getWorldDirection(headingVector);
  headingVector.y = 0;
  
  if (headingVector.lengthSq() < 0.0001) return 0;
  
  headingVector.normalize();
  const rad = Math.atan2(headingVector.x, -headingVector.z);
  return normalizeHeading(rad * 180 / Math.PI);
}

/**
 * Convierte un ángulo a dirección cardinal
 * @param {number} deg - Ángulo en grados
 * @returns {string} Dirección cardinal (N, E, S, W)
 */
function headingToCardinal(deg) {
  if (deg >= 315 || deg < 45) return 'N';
  if (deg >= 45 && deg < 135) return 'E';
  if (deg >= 135 && deg < 225) return 'S';
  return 'W';
}

/**
 * Actualiza el HUD de navegación (coordenadas, brújula)
 * Se ejecuta en cada frame
 */
function updateNavHud() {
  const player = document.getElementById('player');
  
  // Actualiza coordenadas del jugador
  if (player && player.object3D) {
    const pos = player.object3D.position;
    const step = Math.max(0.01, BLOCK_SIZE);
    
    const bx = Math.round(pos.x / step);
    const by = Math.round(pos.y / step);
    const bz = Math.round(pos.z / step);
    
    if (coordXEl) coordXEl.textContent = String(bx);
    if (coordYEl) coordYEl.textContent = String(by);
    if (coordZEl) coordZEl.textContent = String(bz);
    
    // Actualiza coordenadas de celda
    if (coordCellEl) {
      const cx = Math.round((pos.x + halfW) / CELL_SIZE);
      const cz = Math.round((pos.z + halfD) / CELL_SIZE);
      const clampedX = Math.max(0, Math.min(ROOM_W - 1, cx));
      const clampedZ = Math.max(0, Math.min(ROOM_D - 1, cz));
      coordCellEl.textContent = `cell ${clampedX},${clampedZ}`;
    }
  }
  
  // Actualiza brújula
  const heading = headingFromCamera();
  if (headingEl) headingEl.textContent = heading.toFixed(0);
  
  if (compassNeedleEl) {
    const needleRot = -heading;
    compassNeedleEl.style.setProperty('--needle-rot', `${needleRot}deg`);
  }
  
  // Actualiza panel de enfoque de items (definido en Items.js)
  if (typeof updateFocusHud === 'function') {
    updateFocusHud();
  }
  
  requestAnimationFrame(updateNavHud);
}