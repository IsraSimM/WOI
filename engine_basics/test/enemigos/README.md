# Sistema Modular de Juego A-Frame

Código organizado en módulos reutilizables para un juego de primera persona con A-Frame.

## 📁 Estructura de Archivos

```
enemigos/
├── configuracionDatos.js   # Variables globales, constantes y configuración
├── Coliciones.js           # Sistema de detección de colisiones
├── ConstruccionSala.js     # Generación de sala y muros
├── Items.js                # Sistema de items, inventario y HUD
├── Navegacion.js           # Brújula, coordenadas y orientación
├── Movimiento.js           # Componentes A-Frame de movimiento
├── Inicializacion.js       # Inicialización del juego
├── enemies.html            # Archivo HTML principal
└── README.md               # Esta documentación
```

## 🔗 Dependencias entre Módulos

```
configuracionDatos.js (base)
    ↓
├── Coliciones.js
├── ConstruccionSala.js
├── Items.js
├── Navegacion.js (→ Items.js)
└── Movimiento.js (→ Coliciones.js)
    ↓
Inicializacion.js (requiere todos)
```

## 📦 Módulos

### 1. configuracionDatos.js
**Propósito:** Variables globales, constantes y configuración del juego.

**Exports (variables globales):**
- Referencias DOM: `roomEl`, `floorEl`, `headEl`, `bodyEl`, `cameraEl`, etc.
- Constantes de sala: `ROOM_W`, `ROOM_D`, `WALL_LAYERS`
- Dimensiones: `CELL_SIZE`, `BLOCK_SIZE`, `halfW`, `halfD`
- Arrays: `colliders`, `itemsState`, `inventory`
- Vectores THREE.js reutilizables

**Funciones:**
- `loadCalibration()` - Carga configuración de localStorage
- `resolveAssetPath(path)` - Resuelve rutas de assets

### 2. Coliciones.js
**Dependencias:** `configuracionDatos.js`

**Funciones:**
- `intersectsAabb(px, py, pz, radius, height, box)` - Detecta intersección AABB
- `collidesAt(px, py, pz, radius, height)` - Verifica colisión con cualquier collider

### 3. ConstruccionSala.js
**Dependencias:** `configuracionDatos.js`

**Funciones:**
- `addWall(ix, iz)` - Añade un muro en la cuadrícula
- `buildRoom()` - Construye la sala completa con perímetro de muros

### 4. Items.js
**Dependencias:** `configuracionDatos.js`

**Funciones:**
- `clearItems()` - Limpia todos los items
- `setStatus(text, warn)` - Muestra mensajes en HUD
- `getMaxItems()` - Obtiene límite de items según modo
- `updateHud()` - Actualiza el HUD de inventario
- `findLookedItem()` - Encuentra item que el jugador mira
- `updateFocusHud()` - Actualiza panel de info de item
- `placeItems(items)` - Coloca items en la escena
- `loadItems()` - Carga items desde JSON
- `tryPickup()` - Intenta recoger item cercano

### 5. Navegacion.js
**Dependencias:** `configuracionDatos.js`, `Items.js`

**Funciones:**
- `normalizeHeading(deg)` - Normaliza ángulo 0-360
- `headingFromCamera()` - Obtiene dirección de cámara
- `headingToCardinal(deg)` - Convierte a cardinal (N/S/E/W)
- `updateNavHud()` - Actualiza HUD de navegación (loop)

### 6. Movimiento.js
**Dependencias:** `configuracionDatos.js`, `Coliciones.js`

**Componentes A-Frame:**
- `room-player` - Movimiento del jugador con físicas
  - Schema: `speed`, `jump`, `gravity`, `radius`, `height`, `sprintMult`
  - Controles: WASD + Espacio + Shift
  
- `step-bob` - Balanceo de cabeza al caminar
  - Schema: `intensity`, `frequency`, `sway`, `sprintFov`, etc.
  - Simula movimiento natural de cámara

### 7. Inicializacion.js
**Dependencias:** Todos los módulos anteriores

**Funciones:**
- `initGame()` - Inicializa el juego completo
  - Construye sala
  - Carga items
  - Configura eventos
  - Inicia loops de actualización

## 🚀 Uso

### Orden de Carga en HTML

```html
<!-- A-Frame -->
<script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>

<!-- Scripts modulares (ORDEN IMPORTANTE) -->
<script src="configuracionDatos.js"></script>
<script src="Coliciones.js"></script>
<script src="ConstruccionSala.js"></script>
<script src="Items.js"></script>
<script src="Navegacion.js"></script>
<script src="Movimiento.js"></script>
<script src="Inicializacion.js"></script>
```

### Elementos HTML Requeridos

```html
<a-entity id="player" room-player>
  <a-entity id="head" step-bob>
    <a-entity camera></a-entity>
  </a-entity>
  <a-entity id="body"><!-- Visual del jugador --></a-entity>
</a-entity>

<a-entity id="room"></a-entity>
<a-plane id="floor"></a-plane>
```

### Controles

- **WASD** - Movimiento
- **Espacio** - Saltar
- **Shift** - Correr
- **E** - Recoger item
- **Ratón** - Mirar

## 🔧 Personalización

### Cambiar Velocidad del Jugador

En el HTML:
```html
<a-entity id="player" room-player="speed: 10; sprintMult: 1.5">
```

### Ajustar Dimensiones de Sala

En `configuracionDatos.js`:
```javascript
const ROOM_W = 15;  // Ancho
const ROOM_D = 15;  // Profundidad
const WALL_LAYERS = 5;  // Altura en capas
```

### Configurar Límites de Items

En `configuracionDatos.js`:
```javascript
const MODE_LIMITS = {
  casual: 10,
  normal: 6,
  dificil: 3,
  hardcore: 1,
};
```

## 📝 Añadir Nuevas Funcionalidades

### Ejemplo: Nuevo Sistema de Enemigos

1. Crear `Enemigos.js`:
```javascript
/* Sistema de enemigos */
// Requiere: configuracionDatos.js, Coliciones.js

function spawnEnemy(x, y, z) {
  // Tu código aquí
}
```

2. Añadir al HTML antes de `Inicializacion.js`:
```html
<script src="Enemigos.js"></script>
```

3. Llamar desde `Inicializacion.js`:
```javascript
function initGame() {
  buildRoom();
  loadItems();
  spawnEnemy(0, 0, -5);  // Nueva función
  // ...
}
```

## 🐛 Debugging

Ver consola del navegador (F12) para mensajes de inicialización y errores.

### Verificar Módulos Cargados

```javascript
// En consola del navegador
console.log(typeof buildRoom);       // "function"
console.log(typeof collidesAt);      // "function"
console.log(colliders.length);       // Número de colliders
console.log(inventory);              // Array de items
```

## 📄 Licencia

Código original extraído y modularizado del proyecto JURGO.

---

**Última actualización:** Febrero 2026
