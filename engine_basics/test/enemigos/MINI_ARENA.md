# Mini Arena - Escenario de Prueba

## 🎯 Resumen

Este es un **mini escenario de prueba** diseñado para testear mecánicas básicas de movimiento y colisiones sin la complejidad de una sala completa. Perfecto para:

- ✅ Probar controles de jugador
- ✅ Verificar colisiones con muros
- ✅ Testing de físicas (salto, gravedad)
- ✅ Desarrollo de IA de enemigos
- ✅ Prototipado rápido

## 📐 Configuración Actual

El archivo `enemies.html` está configurado con un **mini escenario de prueba**:

### Características:
- **Tamaño**: 5x5 celdas
- **Altura**: 2 bloques
- **Spawn**: Centro (0, 0, 0)
- **Salida**: Sur (apertura en el centro del muro sur)

### Distribución:

```
Vista Superior (Cuadrícula 5x5, índices 0-4):

     0   1   2   3   4
   ╔═══╦═══╦═══╦═══╦═══╗
 0 ║ ■ ║ ■ ║ ■ ║ ■ ║ ■ ║  Norte
   ╠═══╬═══╬═══╬═══╬═══╣
 1 ║ ■ ║   ║   ║   ║ ■ ║
   ╠═══╬═══╬═══╬═══╬═══╣
 2 ║ ■ ║   ║ P ║   ║ ■ ║  Centro (Spawn)
   ╠═══╬═══╬═══╬═══╬═══╣
 3 ║ ■ ║   ║   ║   ║ ■ ║
   ╠═══╬═══╬═══╬═══╬═══╣
 4 ║ ■ ║ ■ ║ . ║ ■ ║ ■ ║  Sur (. = Salida)
   ╚═══╩═══╩═══╩═══╩═══╝

■ = Bloque de pared (2 de altura)
P = Jugador (posición inicial)
. = Salida (sin bloque)

Oeste                    Este
```

### Representación Simplificada:

```
    N (Norte)
    ■ ■ ■ ■ ■
    ■       ■
W ■ ■   P   ■ ■ E
    ■       ■
    ■ ■   ■ ■
       ( )      <- Salida
        S (Sur)
```

### Vista 3D:

```
Capa 2:  ■ ■ ■ ■ ■
         ■       ■
         ■       ■
         ■       ■
         ■ ■   ■ ■

Capa 1:  ■ ■ ■ ■ ■
         ■       ■
         ■   P   ■
         ■       ■
         ■ ■   ■ ■

Piso:    ▓▓▓▓▓▓▓▓▓
         ▓▓▓▓▓▓▓▓▓
         ▓▓▓▓▓▓▓▓▓

■ = Bloque de pared (full.glb)
P = Jugador
▓ = Piso
```

## 🎮 Controles

- **WASD**: Movimiento
- **Espacio**: Saltar
- **Shift**: Correr
- **Mouse**: Mirar alrededor

## 🔧 Cómo Cambiar el Escenario

### Para volver a la sala completa (9x9):

1. Abre `Inicializacion.js`
2. Cambia la línea:
   ```javascript
   buildMiniArena();
   ```
   por:
   ```javascript
   buildRoom();
   ```

3. (Opcional) Ajusta altura en `configuracionDatos.js`:
   ```javascript
   const WALL_LAYERS = 3;  // Cambia de 2 a 3 para sala más alta
   ```

### Para crear tu propio escenario:

Crea una nueva función en `ConstruccionSala.js`:

```javascript
function buildCustomArena() {
  roomEl.innerHTML = '';
  colliders.length = 0;
  
  // Tu código aquí
  // Usa addWall(x, z) para agregar muros individuales
  addWall(0, 0);  // Ejemplo: muro en posición 0,0
}
```

Luego llámala en `Inicializacion.js`:
```javascript
buildCustomArena();
```

## 📊 Coordenadas del Mini Escenario

| Posición | X (celda) | Z (celda) | Descripción |
|----------|-----------|-----------|-------------|
| Centro (Spawn) | 2 | 2 | Jugador inicia aquí |
| Esquina NO | 0 | 0 | Noroeste |
| Esquina NE | 4 | 0 | Noreste |
| Esquina SO | 0 | 4 | Suroeste |
| Esquina SE | 4 | 4 | Sureste |
| **Salida Sur** | 2 | 4 | Apertura para salir |

**Nota**: Las coordenadas se centran automáticamente en el mundo (posición 0,0,0)

## 🚀 Prueba el Escenario

1. Abre `enemies.html` en tu navegador
2. Usa WASD para moverte
3. Camina hacia el sur para salir por la apertura
4. Observa las colisiones con los muros

## 📝 Notas Técnicas

- Cada celda mide `CELL_SIZE` unidades (por defecto 6)
- Los muros usan el modelo `full.glb` de `../assets/blocks/`
- Las colisiones se calculan automáticamente
- El jugador spawneará siempre en el centro del escenario

---

**Configuración actual**: Mini Arena 5x5 con 2 bloques de altura
