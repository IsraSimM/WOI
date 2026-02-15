# Estructura del Directorio Enemigos

Este directorio contiene la prueba de simulación de enemigos organizada de forma modular.

## 📁 Estructura de Carpetas

```
enemigos/
├── enemies.html          # Archivo principal HTML
├── dijkstra_test.html    # Prueba del algoritmo Dijkstra
├── scripts/              # Scripts JavaScript organizados por funcionalidad
│   ├── core/            # Scripts fundamentales del sistema
│   │   ├── configuracionDatos.js    # Configuración de datos
│   │   └── Inicializacion.js        # Inicialización del juego
│   ├── systems/         # Sistemas del juego
│   │   ├── Coliciones.js           # Sistema de colisiones
│   │   ├── ConstruccionSala.js     # Construcción de salas
│   │   ├── Items.js                # Sistema de items
│   │   ├── Navegacion.js           # Sistema de navegación
│   │   └── Movimiento.js           # Sistema de movimiento
│   └── ai/              # Inteligencia artificial
│       ├── dijkstra.js             # Algoritmo de pathfinding Dijkstra
│       ├── EnemyAI.js              # IA de enemigos
│       └── pacman_movimiento.js    # Movimiento tipo Pacman
├── assets/              # Recursos del juego
│   └── Pacman.glb                  # Modelo 3D de Pacman
└── docs/                # Documentación
    ├── README.md                   # Documentación general
    ├── GUIA_RAPIDA.md             # Guía rápida de uso
    ├── MINI_ARENA.md              # Documentación de mini arena
    └── DIJKSTRA_TEST.md           # Guía del test de Dijkstra
```

## 🎯 Orden de Carga de Scripts

Los scripts se cargan en el siguiente orden en `enemies.html`:

1. **configuracionDatos.js** - Configuración inicial
2. **Coliciones.js** - Sistema de colisiones
3. **ConstruccionSala.js** - Construcción de entorno
4. **Items.js** - Sistema de items
5. **Navegacion.js** - Sistema de navegación
6. **Movimiento.js** - Control de movimiento
7. **Inicializacion.js** - Inicialización final

## 🚀 Uso

### Prueba de Enemigos (enemies.html)
Abre `enemies.html` en un navegador compatible con WebGL para ejecutar la prueba.

### Prueba de Dijkstra (dijkstra_test.html)
Abre `dijkstra_test.html` para probar el algoritmo de pathfinding:
- **Generar Mapa**: Crea mapas aleatorios con paredes
- **Configurar Puntos**: Define inicio (verde) y fin (rojo)
- **Calcular Camino**: Ejecuta el algoritmo Dijkstra
- **Visualización**: Ve el camino en 2D y 3D con animación

Características:
- ✅ Generación de mapas aleatorios con densidad configurable
- ✅ Colocación interactiva de puntos de inicio y fin
- ✅ Visualización del camino en 2D (canvas)
- ✅ Visualización del camino en 3D (A-Frame)
- ✅ Animación de entidad siguiendo el camino
- ✅ Medición de rendimiento del algoritmo

## 📝 Notas

- Todos los scripts usan `defer` para asegurar la carga en orden
- La estructura mantiene separación de responsabilidades
- Los assets están centralizados en su propia carpeta
