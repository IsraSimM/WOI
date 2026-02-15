# Sistema de Audio para Enemigos 🔊

Sistema modular para gestionar los sonidos de enemigos basados en la distancia y visibilidad del jugador.

## 📁 Archivos

- **Módulo principal**: `scripts/systems/AudioSystem.js`
- **Audios requeridos** (en `assets/`):
  - `approaching_monster.wav` - Sonido cuando el enemigo está cerca
  - `approaching_monster2.wav` - Variación del sonido de aproximación
  - `monster_view.wav` - Sonido cuando el jugador entra al campo de visión
  - `monster_eat.wav` - Sonido cuando el enemigo alcanza al jugador (opcional)

## 🚀 Uso Rápido

### 1. Importar el módulo

```javascript
import { EnemyAudioSystem } from './scripts/systems/AudioSystem.js';

// Crear instancia
const audioSystem = new EnemyAudioSystem();
```

### 2. Configurar assets en A-Frame

```html
<a-assets>
  <audio id="snd-approaching1" src="assets/approaching_monster.wav" preload="auto"></audio>
  <audio id="snd-approaching2" src="assets/approaching_monster2.wav" preload="auto"></audio>
  <audio id="snd-monster-view" src="assets/monster_view.wav" preload="auto"></audio>
  <audio id="snd-monster-eat" src="assets/monster_eat.wav" preload="auto"></audio>
</a-assets>
```

### 3. Agregar elementos de sonido al enemigo

```html
<a-entity id="enemy">
  <a-entity gltf-model="#enemyModel"></a-entity>
  
  <!-- Sonidos -->
  <a-sound id="sound-approaching1" src="#snd-approaching1" volume="0.5"></a-sound>
  <a-sound id="sound-approaching2" src="#snd-approaching2" volume="0.5"></a-sound>
  <a-sound id="sound-monster-view" src="#snd-monster-view" volume="0.7"></a-sound>
  <a-sound id="sound-monster-eat" src="#snd-monster-eat" volume="0.6"></a-sound>
</a-entity>
```

### 4. Inicializar el sistema

```javascript
function initializeAudioSystem() {
  const soundElements = {
    approaching1: document.getElementById('sound-approaching1'),
    approaching2: document.getElementById('sound-approaching2'),
    monsterView: document.getElementById('sound-monster-view'),
    monsterEat: document.getElementById('sound-monster-eat'),
  };
  
  audioSystem.initialize(soundElements);
}

// Llamar después de que A-Frame esté listo
document.querySelector('a-scene').addEventListener('loaded', () => {
  setTimeout(() => {
    initializeAudioSystem();
  }, 1000);
});
```

### 5. Actualizar en el loop de juego

```javascript
function gameLoop() {
  // Obtener posiciones
  const enemyPos = enemyEntity.getAttribute('position');
  const playerPos = cameraEntity.getAttribute('position');
  
  // Actualizar sistema de audio
  audioSystem.update(enemyPos, playerPos);
  
  requestAnimationFrame(gameLoop);
}
```

## ⚙️ Configuración

### Parámetros por defecto

```javascript
{
  // Distancias (en unidades del mundo)
  closeDistance: 8,        // Distancia para sonidos "approaching"
  veryCloseDistance: 4,    // Distancia para alternar entre approaching1 y 2
  viewDistance: 15,        // Distancia de campo de visión
  
  // Control de reproducción
  approachingCooldown: 2000,  // ms entre reproducciones de "approaching"
  viewCooldown: 5000,         // ms entre reproducciones de "view"
}
```

### Personalizar configuración

```javascript
audioSystem.configure({
  viewDistance: 20,
  closeDistance: 10,
  approachingCooldown: 1500,
  viewCooldown: 3000,
});
```

## 🎮 API Completa

### `initialize(soundElements)`
Inicializa el sistema con referencias a los elementos `<a-sound>`.

```javascript
audioSystem.initialize({
  approaching1: document.getElementById('sound-approaching1'),
  approaching2: document.getElementById('sound-approaching2'),
  monsterView: document.getElementById('sound-monster-view'),
  monsterEat: document.getElementById('sound-monster-eat'), // opcional
});
```

### `update(enemyPosition, playerPosition)`
Actualiza el sistema basado en las posiciones. Llamar en cada frame.

```javascript
audioSystem.update(
  { x: 10, y: 0, z: 5 },  // Posición del enemigo
  { x: 0, y: 0, z: 0 }    // Posición del jugador
);
```

### `playSound(soundKey)`
Reproduce un sonido específico manualmente.

```javascript
audioSystem.playSound('monsterView');
audioSystem.playSound('approaching1');
audioSystem.playSound('monsterEat');
```

### `playEatSound()`
Reproduce el sonido de "comer" cuando el enemigo alcanza al jugador.

```javascript
if (enemyReachedPlayer) {
  audioSystem.playEatSound();
}
```

### `setEnabled(enabled)`
Habilita o deshabilita el sistema.

```javascript
audioSystem.setEnabled(false); // Deshabilitar
audioSystem.setEnabled(true);  // Habilitar
```

### `reset()`
Reinicia el estado del sistema (útil al reiniciar nivel).

```javascript
audioSystem.reset();
```

### `configure(newConfig)`
Actualiza la configuración del sistema.

```javascript
audioSystem.configure({
  viewDistance: 20,
  closeDistance: 10,
});
```

## 🔍 Cómo Funciona

### Sonido "Monster View"
- Se reproduce cuando el jugador **entra** al campo de visión del enemigo
- Distancia: `viewDistance` (default: 15 unidades)
- Solo se activa en la transición de "fuera" a "dentro" del rango
- Cooldown: 5 segundos entre reproducciones

### Sonidos "Approaching"
- Se reproducen cuando el enemigo está **cerca** del jugador
- Distancia: `closeDistance` (default: 8 unidades)
- Alterna automáticamente entre `approaching1` y `approaching2`
- Se reproduce más frecuentemente si está muy cerca (`veryCloseDistance`: 4 unidades)
- Cooldown: 2 segundos entre reproducciones

### Sonido "Eat"
- Se reproduce manualmente cuando el enemigo alcanza al jugador
- Usar `playEatSound()` en tu lógica de colisión

## 📊 Ejemplo Completo

```javascript
import { EnemyAudioSystem } from './scripts/systems/AudioSystem.js';

// Crear instancia
const audioSystem = new EnemyAudioSystem();

// Configurar
audioSystem.configure({
  viewDistance: 20,
  closeDistance: 12,
});

// Inicializar (después de que A-Frame esté listo)
document.querySelector('a-scene').addEventListener('loaded', () => {
  setTimeout(() => {
    const soundElements = {
      approaching1: document.getElementById('sound-approaching1'),
      approaching2: document.getElementById('sound-approaching2'),
      monsterView: document.getElementById('sound-monster-view'),
      monsterEat: document.getElementById('sound-monster-eat'),
    };
    
    audioSystem.initialize(soundElements);
    console.log('✅ Sistema de audio listo');
  }, 1000);
});

// En el loop de juego
function gameLoop() {
  const enemy = document.getElementById('enemy');
  const camera = document.querySelector('[camera]');
  
  const enemyPos = enemy.getAttribute('position');
  const playerPos = camera.getAttribute('position');
  
  // Actualizar audio
  audioSystem.update(enemyPos, playerPos);
  
  requestAnimationFrame(gameLoop);
}
```

## 🎯 Ejemplo de Integración con Sistema de Enemigos

```javascript
// En tu archivo principal (ej: enemies.html)
import { EnemyAudioSystem } from './scripts/systems/AudioSystem.js';

const audioSystems = []; // Un sistema por cada enemigo

// Al crear un enemigo
function createEnemy(enemyData) {
  const enemyAudio = new EnemyAudioSystem();
  
  // Configurar según tipo de enemigo
  if (enemyData.type === 'fast') {
    enemyAudio.configure({
      closeDistance: 12,
      viewDistance: 20,
      approachingCooldown: 1000, // Más frecuente
    });
  }
  
  audioSystems.push(enemyAudio);
  
  // ... resto de la creación del enemigo
}

// En el loop de actualización
function updateEnemies() {
  enemies.forEach((enemy, index) => {
    // ... actualizar movimiento del enemigo
    
    // Actualizar audio
    audioSystems[index].update(
      enemy.position,
      player.position
    );
  });
}
```

## 🛠️ Testing

Para probar el sistema:
1. Abre `dijkstra_test.html`
2. Genera un mapa y calcula un camino
3. Activa "Animar Pacman en el camino"
4. El sistema de audio se activará automáticamente
5. Mueve la cámara con WASD para cambiar la distancia al enemigo
6. Escucharás los sonidos según tu distancia

## 📝 Notas

- Los sonidos se reproducen usando el componente `<a-sound>` de A-Frame
- El sistema calcula distancias euclidianas en 3D
- Los cooldowns evitan spam de sonidos
- El sistema es completamente modular y reutilizable
- Puedes tener múltiples instancias para múltiples enemigos

## 🔧 Troubleshooting

**No se escucha audio:**
- Verifica que los archivos .wav existan en `assets/`
- Asegúrate de que A-Frame esté completamente cargado
- Revisa el volumen en los elementos `<a-sound>`

**Audio se reproduce constantemente:**
- Ajusta los valores de `cooldown` en la configuración
- Verifica que las distancias estén correctamente calibradas

**Audio no se activa a la distancia esperada:**
- Usa `audioSystem.configure()` para ajustar distancias
- Verifica que las posiciones se estén actualizando correctamente
