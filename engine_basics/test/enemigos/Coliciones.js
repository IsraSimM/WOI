/* Colisiones */

// Margen pequeno para evitar engancharse en esquinas
const COLLISION_SKIN = 0.06;

// Requiere: configuracionDatos.js (para acceso a array colliders)

/**
 * Verifica si un AABB del jugador intersecta con un AABB de colisión
 * @param {number} px - Posición X del jugador
 * @param {number} py - Posición Y del jugador
 * @param {number} pz - Posición Z del jugador
 * @param {number} radius - Radio del cilindro del jugador (en plano XZ)
 * @param {number} height - Altura del jugador
 * @param {Object} box - Caja de colisión con propiedades minX, maxX, minY, maxY, minZ, maxZ
 * @returns {boolean} true si hay intersección
 */
function intersectsAabb(px, py, pz, radius, height, box) {
  // Define los límites del jugador como un AABB
  const skin = Math.max(0, Math.min(radius * 0.5, COLLISION_SKIN));
  const minX = px - radius + skin;
  const maxX = px + radius - skin;
  const minZ = pz - radius + skin;
  const maxZ = pz + radius - skin;
  const minY = py;
  const maxY = py + height;
  
  // Verifica separación en cada eje (test SAT simplificado)
  if (maxX <= box.minX || minX >= box.maxX) return false;
  if (maxZ <= box.minZ || minZ >= box.maxZ) return false;
  if (maxY <= box.minY || minY >= box.maxY) return false;
  
  return true;
}

/**
 * Verifica si el jugador colisiona con algún collider en la posición dada
 * @param {number} px - Posición X a verificar
 * @param {number} py - Posición Y a verificar
 * @param {number} pz - Posición Z a verificar
 * @param {number} radius - Radio del jugador
 * @param {number} height - Altura del jugador
 * @returns {boolean} true si hay colisión
 */
function collidesAt(px, py, pz, radius, height) {
  for (const box of colliders) {
    if (intersectsAabb(px, py, pz, radius, height, box)) return true;
  }
  return false;
}