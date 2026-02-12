/* Inicialización del juego */

// Requiere: todos los demás módulos cargados previamente

/**
 * Inicializa el juego completo
 * Construye la sala, carga items y configura eventos
 */
function initGame() {
  // Construye la sala con muros
  buildRoom();
  
  // Carga los items desde el JSON
  loadItems();
  
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
  
  console.log('Juego inicializado correctamente');
}

// Inicializa el juego cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
