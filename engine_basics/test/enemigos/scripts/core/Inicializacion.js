/* Inicialización del juego */

// Requiere: todos los demás módulos cargados previamente

/**
 * Inicializa el juego completo
 * Construye la sala, carga items y configura eventos
 */
function initGame() {
  // *** ELIGE TU ESCENARIO ***
  // Opción 1: Mini arena 5x5 con salida al sur (por defecto)
  buildMiniArena();
  
  // Opción 2: Sala completa (descomenta para usar)
  // NOTA: Si usas buildRoom(), cambia ROOM_W y ROOM_D a 9 en configuracionDatos.js
  // buildRoom();
  
  // Carga los items desde el JSON (comentado para el mini escenario)
  // Descomenta si quieres items en el escenario:
  // loadItems();
  
  // Actualiza el HUD inicial
  updateHud();
  
  // Inicia el loop de actualización de navegación
  updateNavHud();
  
  // Event listener para cambio de modo de juego
  if (modeSelect) {
    modeSelect.addEventListener('change', () => updateHud());
  }
  
  // Event listener para recoger items con tecla E
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') tryPickup();
  });
  
  // Event listener para toggle de head bob si existe
  if (bobToggle && headEl) {
    bobToggle.addEventListener('change', () => {
      headEl.setAttribute('step-bob', 'enabled', bobToggle.checked);
    });
  }
  
  console.log('Mini escenario inicializado - Arena 5x5 con salida al sur');
  console.log('Controles: WASD=mover, Espacio=saltar, Shift=correr, Mouse=mirar');
}

// Inicializa el juego cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
