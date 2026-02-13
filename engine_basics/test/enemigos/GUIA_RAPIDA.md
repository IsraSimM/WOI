# 🚀 Guía Rápida - Mini Arena

## Paso 1: Verifica los Archivos

Asegúrate de tener estos archivos en tu carpeta `enemigos/`:

- ✅ `configuracionDatos.js`
- ✅ `Coliciones.js`
- ✅ `ConstruccionSala.js`
- ✅ `Items.js`
- ✅ `Navegacion.js`
- ✅ `Movimiento.js`
- ✅ `Inicializacion.js`
- ✅ `enemies.html`

## Paso 2: Verifica el Asset

El archivo `full.glb` debe estar en:
```
engine_basics/assets/blocks/full.glb
```

Desde `enemies.html` la ruta relativa es:
```
../assets/blocks/full.glb
```

## Paso 3: Abre el Archivo

Abre `enemies.html` en tu navegador favorito:
- Chrome ✅
- Firefox ✅
- Edge ✅

## Paso 4: Prueba los Controles

| Tecla | Acción |
|-------|--------|
| W | Avanzar |
| A | Izquierda |
| S | Retroceder |
| D | Derecha |
| Espacio | Saltar |
| Shift | Correr |
| Mouse | Mirar alrededor |

## Paso 5: Explora el Escenario

```
Tu posición inicial (centro):
    ■ ■ ■ ■ ■
    ■       ■
    ■   👤  ■  <- Estás aquí
    ■       ■
    ■ ■   ■ ■
       ↓
    Salida
```

1. Camina hacia adelante (W) - deberías chocar con el muro norte
2. Gira 180° con el mouse
3. Camina hacia la salida (sur)
4. Cruza por la apertura central

## 🎨 Personalizar el Escenario

### Cambiar el Tamaño

En `configuracionDatos.js`:
```javascript
const ROOM_W = 7;  // Cambia de 5 a 7 para arena más grande
const ROOM_D = 7;
```

En `ConstruccionSala.js`, función `buildMiniArena()`:
```javascript
const arenaSize = 7;  // Actualiza también aquí

// Ajusta los loops según el nuevo tamaño
for (let x = 0; x < 7; x++) { // era 5
  // ...
}
```

### Cambiar la Altura

En `configuracionDatos.js`:
```javascript
const WALL_LAYERS = 3;  // Cambia de 2 a 3 bloques
```

### Mover la Salida

En `ConstruccionSala.js`, función `buildMiniArena()`:

**Para salida en el Norte:**
```javascript
// Muro norte con apertura
addWall(0, 0);
addWall(1, 0);
// x=2 es la apertura
addWall(3, 0);
addWall(4, 0);

// Muro sur completo
for (let x = 0; x < 5; x++) {
  addWall(x, 4);
}
```

**Para salida en el Este:**
```javascript
// Muro este con apertura
addWall(4, 0);
addWall(4, 1);
// z=2 es la apertura
addWall(4, 3);
addWall(4, 4);

// Muro oeste completo
for (let z = 0; z < 5; z++) {
  addWall(0, z);
}
```

### Múltiples Salidas

```javascript
// Muro norte con apertura
addWall(0, 0);
// apertura en x=1
addWall(2, 0);
// apertura en x=3
addWall(4, 0);

// Resultado: 2 salidas en el norte
```

## 🐛 Solución de Problemas

### No veo las paredes

1. Verifica que `full.glb` existe en `../assets/blocks/`
2. Abre la consola del navegador (F12)
3. Busca errores de carga de modelos
4. El mensaje esperado es: `"Mini escenario inicializado - Arena 5x5 con salida al sur"`

### El jugador cae infinitamente

El piso debe tener `id="floor"`:
```html
<a-plane id="floor" ...></a-plane>
```

### No hay colisiones

Verifica en la consola:
```javascript
console.log(colliders.length);  // Debe ser > 0
```

### El jugador no se mueve

1. Verifica que el player tenga `id="player"`
2. Verifica que tenga el componente `room-player`
3. Haz clic en la ventana para que capture el teclado

## 📊 Información Técnica

- **Tamaño de celda**: 6 unidades (por defecto)
- **Bloques por capa**: 1
- **Altura por bloque**: 6 unidades
- **Arena total**: 30x30 unidades (5 celdas × 6 unidades)
- **Altura total**: 12 unidades (2 bloques × 6 unidades)
- **Colliders**: 16 cajas AABB

## 🎯 Siguiente Paso

Una vez que el mini escenario funcione:

1. ✅ Prueba el sistema de items descomentando `loadItems()` en `Inicializacion.js`
2. ✅ Cambia a sala completa con `buildRoom()`
3. ✅ Crea tu propio escenario personalizado
4. ✅ Agrega enemigos y mecánicas de juego

---

**¿Todo funciona?** ¡Estás listo para desarrollar tu juego! 🎮
