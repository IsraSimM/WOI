# 🎯 Test de Algoritmo Dijkstra

Este documento explica cómo usar el archivo `dijkstra_test.html` para probar y visualizar el algoritmo de pathfinding Dijkstra.

## 📋 Descripción

El algoritmo Dijkstra es un algoritmo de búsqueda de caminos que encuentra el camino más corto entre dos puntos en un grafo o mapa. En este test, lo usamos para navegación de enemigos en un entorno 2D con obstáculos.

## 🚀 Cómo usar

### 1. Abrir el archivo

Abre `dijkstra_test.html` en un navegador moderno compatible con WebGL (Chrome, Firefox, Edge).

### 2. Generar un mapa

En el panel de control, puedes:
- Ajustar el **ancho** y **alto** del mapa (5-30 celdas)
- Configurar la **densidad de paredes** (0-80%)
- Hacer clic en **"Generar Mapa Aleatorio"** para crear un nuevo mapa

### 3. Configurar puntos de inicio y fin

Hay dos formas de configurar los puntos:

#### Método 1: Hacer clic en el mapa
- Activa el modo "Colocar inicio" (checkbox verde)
- Haz clic en el mapa 2D donde quieras el punto de inicio
- Activa el modo "Colocar fin" (checkbox rojo)
- Haz clic en el mapa donde quieras el punto final

#### Método 2: Coordenadas manuales
- Introduce las coordenadas X, Y para el inicio
- Introduce las coordenadas X, Y para el fin
- Haz clic en "Aplicar Coordenadas"

### 4. Calcular el camino

Haz clic en **"Calcular Camino (Dijkstra)"** para ejecutar el algoritmo.

El sistema mostrará:
- ✅ **Éxito**: "Camino encontrado: X pasos" (en verde)
- ❌ **Fallo**: "No se encontró camino" (en naranja)

### 5. Visualizar resultados

#### Mapa 2D (Canvas)
- **Gris claro**: Espacios caminables
- **Gris oscuro**: Paredes (obstáculos)
- **Verde**: Punto de inicio
- **Rojo**: Punto final
- **Azul**: Camino encontrado

#### Vista 3D (A-Frame)
- **Cubos grises**: Paredes en 3D
- **Cilindros**: Marcadores de inicio (verde) y fin (rojo)
- **Cajas azules**: Nodos del camino
- **Pacman (modelo 3D)**: Entidad animada siguiendo el camino con rotación realista

## ⚙️ Opciones de visualización

### Mostrar camino en 3D
Activa/desactiva la visualización de las cajas azules que marcan el camino.

### Animar entidad en el camino
Activa/desactiva el modelo de Pacman que se mueve siguiendo el camino calculado. 
La animación utiliza la misma velocidad que el jugador (8 unidades/segundo) y Pacman 
rota automáticamente en la dirección del movimiento. La animación se repite en loop.

### Ajustes 3D
- **Tamaño de celda**: Cambia el tamaño de cada celda en el mundo 3D (1-5)
- **Altura de paredes**: Ajusta la altura de los obstáculos (1-10)
- **Reconstruir 3D**: Aplica los cambios de visualización

## 🎮 Controles de cámara

En la vista 3D:
- **WASD**: Mover la cámara (modo fly)
- **Mouse**: Rotar la vista
- **Scroll**: (Depende del navegador)

## 🔧 Detalles técnicos

### Algoritmo Dijkstra

El algoritmo implementado en `scripts/ai/dijkstra.js` utiliza:
- **Estructura de datos**: Cola de prioridad simple con arreglos tipados
- **Complejidad**: O((V + E) log V) donde V = nodos, E = aristas
- **Vecinos**: 4 direcciones (arriba, abajo, izquierda, derecha)
- **Costo**: Uniforme (1 por paso)

### Formato del mapa

```javascript
// Uint8Array donde:
CELL.EMPTY = 0  // Caminable
CELL.WALL = 1   // No caminable
```

### Resultado del algoritmo

El algoritmo devuelve un array de puntos:
```javascript
[
  { x: 1, y: 1 },   // Inicio
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  // ...
  { x: 13, y: 13 }  // Fin
]
```

## 💡 Casos de uso

### Testing de IA de enemigos
- Prueba si los enemigos pueden naveg
- Visualiza el movimiento con velocidad realista del jugador (8 unidades/seg)ar correctamente
- Verifica rutas en diferentes configuraciones de mapas
- Mide el rendimiento del pathfinding

### Validación de niveles
- Comprueba que todos los puntos importantes sean alcanzables
- Detecta áreas aisladas del mapa
- Optimiza la distribución de obstáculos

### Depuración
- Visualiza exactamente qué camino toma el algoritmo
- Identifica problemas con configuraciones específicas
- Compara diferentes estrategias de pathfinding

## ⚠️ Limitaciones

- El algoritmo no considera movimiento diagonal
- No hay optimización con heurísticas (para eso usa A*)
- Mapas muy grandes (>30x30) pueden ser lentos en el navegador
- La animación se reinicia al completar el camino

## 🔄 Mejoras futuras

Posibles extensiones:
- [ ] Soporte para movimiento diagonal
- [ ] Comparación con A* (con heurística)
- [ ] Pesos variables en celdas (terreno difícil)
- [ ] Múltiples enemigos con pathfinding concurrente
- [ ] Smooth pathfinding (suavizado de caminos)
- [ ] Obstacle avoidance dinámico

## 📚 Referencias

- [Algoritmo de Dijkstra - Wikipedia](https://es.wikipedia.org/wiki/Algoritmo_de_Dijkstra)
- [Pathfinding Algorithms](https://www.redblobgames.com/pathfinding/a-star/introduction.html)
- [A-Frame Documentation](https://aframe.io/docs/)

---

**Autor**: Sistema de prueba para navegación de enemigos  
**Versión**: 1.0  
**Última actualización**: Febrero 2026
