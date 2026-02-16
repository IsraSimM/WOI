# Sistema de Morph Targets (Shape Keys) 🎭

Control de expresiones faciales y deformaciones para modelos GLTF con shape keys.

## 📦 Archivos

- **Módulo**: `scripts/systems/MorphTargetController.js`
- **Implementado en**: `enemies.html`

## 🎮 Uso en enemies.html

### Panel Lateral Derecho

El panel incluye:

1. **Botones de Expresiones Predefinidas**:
   - 😐 **Neutral**: Estado base (todos los morph targets a 0)
   - 😊 **Feliz**: Activa Key1
   - 😠 **Enojado**: Activa Key2

2. **Controles Deslizantes (Sliders)**:
   - Control manual de cada shape key
   - Valores de 0.00 a 1.00
   - Se generan automáticamente según las shape keys del modelo

3. **Indicador de Estado**:
   - Muestra si el sistema está listo
   - Feedback visual de carga

## 💻 API del Módulo

### Crear Controlador

```javascript
import { MorphTargetController, morphTargetManager } from './scripts/systems/MorphTargetController.js';

// Crear controlador para una entidad
const controller = new MorphTargetController('enemy');
await controller.initialize();

// Registrar en el manager global
morphTargetManager.register('enemy', controller);
```

### Cambiar Expresiones

```javascript
// Cambiar a una expresión predefinida
controller.setExpression('happy', 300); // 300ms de transición

// Cambio instantáneo
controller.setExpression('neutral', 0);
```

### Control Manual de Morph Targets

```javascript
// Establecer un morph target específico
controller.setMorphTarget('Key1', 0.75);

// Obtener valor actual
const value = controller.getMorphTarget('Key1');

// Resetear todo a neutral
controller.reset();
```

### Expresiones Personalizadas

```javascript
// Definir una expresión personalizada
controller.defineExpression('scared', {
  'Key1': 0.3,
  'Key2': 0.7
});

// Usarla
controller.setExpression('scared', 200);
```

### Callbacks

```javascript
// Notificación cuando cambia la expresión
controller.onExpressionChange = (expressionName) => {
  console.log(`Cambió a: ${expressionName}`);
};
```

## 🎵 Integración con Sistema de Audio

Para sincronizar expresiones con eventos de audio:

```javascript
import { EnemyAudioSystem } from './scripts/systems/AudioSystem.js';
import { MorphTargetController } from './scripts/systems/MorphTargetController.js';

const audioSystem = new EnemyAudioSystem();
const morphController = new MorphTargetController('enemy');

// Inicializar ambos sistemas...

// Cambiar expresión según el audio
audioSystem.onSoundPlay = (soundKey) => {
  if (soundKey === 'monsterView') {
    morphController.setExpression('angry', 200);
  } else if (soundKey === 'approaching1' || soundKey === 'approaching2') {
    morphController.setExpression('happy', 150);
  } else if (soundKey === 'monsterEat') {
    morphController.setExpression('angry', 0); // Instantáneo
  }
};
```

## 🔧 Expresiones Predefinidas

El sistema crea automáticamente estas expresiones basadas en los morph targets disponibles:

### `neutral`
- Todos los morph targets a 0
- Estado base del modelo

### `happy`
- Activa `Key1` a 1.0 (si existe)
- O el primer morph target disponible

### `angry`
- Activa `Key2` a 1.0 (si existe)
- O el segundo morph target disponible

### `custom`
- Vacía por defecto
- Para definiciones personalizadas

## 🎨 Personalización de Expresiones

```javascript
// Obtener morph targets disponibles
const morphTargets = controller.getMorphTargets();
console.log(morphTargets); // { Key1: 0, Key2: 1 }

// Definir una expresión compleja
controller.defineExpression('mixedEmotion', {
  'Key1': 0.5,  // 50% de la primera expresión
  'Key2': 0.3   // 30% de la segunda expresión
});

controller.setExpression('mixedEmotion', 400);
```

## 🌐 Acceso Global (Debugging)

El sistema expone variables globales en la consola:

```javascript
// En la consola del navegador:
window.enemyMorphController.setExpression('happy');
window.enemyMorphController.getMorphTargets();
window.morphTargetManager.get('enemy');
```

## ⚙️ Parámetros de Transición

Las transiciones entre expresiones usan easing "ease-out cubic" para un movimiento natural:

```javascript
// Sin transición (instantáneo)
controller.setExpression('happy', 0);

// Transición suave (recomendado)
controller.setExpression('happy', 200);  // 200ms

// Transición lenta (dramático)
controller.setExpression('angry', 800);  // 800ms
```

## 🔍 Verificación de Shape Keys

Para verificar qué shape keys tiene tu modelo:

1. Abre la consola del navegador (F12)
2. Busca el mensaje: `✅ Morph targets encontrados:`
3. También puedes usar: `window.enemyMorphController.getMorphTargets()`

## 📊 Estructura del Modelo

El controlador busca automáticamente mallas con `morphTargetInfluences`:

```javascript
model.traverse((node) => {
  if (node.isMesh && node.morphTargetInfluences) {
    // Encuentra el mesh con morph targets
  }
});
```

## 🛠️ Troubleshooting

**No se detectan morph targets:**
- Verifica que el modelo GLTF tenga shape keys exportadas
- Asegúrate de que el modelo esté completamente cargado
- Revisa la consola para mensajes de error

**Las expresiones no cambian:**
- Verifica que `isReady` sea `true`
- Comprueba que los nombres de los morph targets sean correctos
- Usa `controller.getMorphTargets()` para ver los disponibles

**Transiciones demasiado rápidas/lentas:**
- Ajusta el parámetro `duration` en `setExpression()`
- Valores típicos: 150-400ms

## 💡 Consejos

1. **Performance**: Los morph targets son eficientes, pero evita cambios muy frecuentes (< 100ms)
2. **Naturalidad**: Usa transiciones de 200-300ms para movimientos naturales
3. **Testing**: Usa el panel lateral para experimentar con valores antes de programarlos
4. **Debugging**: Activa los logs en consola para ver qué está pasando

## 🚀 Ejemplo Completo

```javascript
// Inicialización
const morphController = new MorphTargetController('enemy');
await morphController.initialize();

// Definir expresiones personalizadas
morphController.defineExpression('surprised', {
  'Key1': 0.8,
  'Key2': 0.2
});

// Sistema de expresiones reactivo
function reactToPlayerDistance(distance) {
  if (distance < 5) {
    morphController.setExpression('angry', 200);
  } else if (distance < 10) {
    morphController.setExpression('happy', 300);
  } else {
    morphController.setExpression('neutral', 400);
  }
}

// Loop de juego
function gameLoop() {
  const playerPos = player.getAttribute('position');
  const enemyPos = enemy.getAttribute('position');
  const distance = calculateDistance(playerPos, enemyPos);
  
  reactToPlayerDistance(distance);
  
  requestAnimationFrame(gameLoop);
}
```

## 📝 Notas

- El sistema es completamente modular y reutilizable
- Compatible con cualquier modelo GLTF que tenga morph targets
- Los sliders se generan automáticamente según las shape keys del modelo
- Las expresiones se pueden cambiar en tiempo real sin impacto en performance
