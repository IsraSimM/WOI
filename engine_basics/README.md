# WorldItOver

Herramientas de prototipo para generacion del mapa.

## Modulos funcionales (listos para el primer Git push)
### 1. 2D generador de mapa (UI + engine)
Funcionamiento:
- Generacion de laberinto con DFS (celdas 0/1) y opcion de modo endless por chunks.
- Salas por rectangulos o por plantilla 16x16 con rotaciones (opcional forzar muros).
- Bordes: normal, sin bordes o pacmanize (elimina callejones sin salida).
- Objetivos: entrada/salida en borde y start/end internos (auto o manual).
- Preview: tipo de bloque, direccion y vista de todos los tipos.
- Canvas con zoom, pan, grid y limites de render.

### 2. 3D carga de mapa (A-Frame)
Funcionamiento:
- Genera el mapa desde el mismo engine que el 2D.
- Usa assets GLB para bloques y calibracion guardada en `asset_calibrator`.
- Altura de muros por capas (stacked), techo opcional y minimapa.
- Guardado/carga de mundos en localStorage y export/import JSON.

### 3. Assets (bloques + items)
Funcionamiento:
- Bloques GLB para tipos de muro (unilateral, bilateral, esquina, trilateral, full).
- Items GLB configurados en `game_data/items/items.json` con color y metadata.

## Como ejecutar
Usa cualquier servidor HTTP estatico local (los modulos y fetch requieren HTTP). Luego abre:
- `test/maze.html` para el generador 2D
- `test/maze_3d.html` para el cargador 3D
- `test/asset_calibrator.html` para calibrar assets de bloques (opcional)
- `test/room.html` para prueba de jugador + items (opcional)

## Documentacion
- `docs/2d-map-generator.md`
- `docs/3d-labyrinth.md`
- `docs/assets.md`

## Estructura del repositorio
- `world/map_generation/map_gen.js` core del generador de laberintos
- `world/world_procesing/world_saver.js` export/import de snapshot del mundo
- `test/maze.html` UI del generador 2D
- `test/maze_3d.html` UI del cargador 3D
- `test/asset_calibrator.html` calibracion de assets de bloques
- `assets/blocks` assets GLB de bloques
- `assets/items` assets GLB de items
- `game_data/items/items.json` definiciones de items

## Referenciasgeneralitas de todo, mas detalles y cosas curiosas en cada doc :0

### Algoritmos de generacion
- Búsqueda en profundidad aleatorizada / retroceso recursivo: https://en.wikipedia.org/wiki/Maze_generation_algorithm
- Retroceso recursivo explicado paso a paso esto esta loquillo: https://weblog.jamisbuck.org/2010/12/27/maze-generation-recursive-backtracking.html
- Laberinto braid (sin callejones sin salida, con bucles) para el pacmanizai, aqui hay mucha data de laberintos: https://www.astrolog.org/labyrnth/glossary.htm
- Búsqueda en anchura (BFS) para distancias en grafos: https://en.wikipedia.org/wiki/Breadth-first_search
- Camino más largo / diámetro mediante dos BFS (árbol) este es para hacer rutas dificiles: https://www.geeksforgeeks.org/longest-path-undirected-tree/

### Carga y serialización de mundo
- API Web Storage (localStorage) lo de almacenamiento, no me referi de ahi pero si quieren info esa es la chida: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- JSON.parse este tambien es el oficial casi pero no lo use como tal: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
- JSON.stringify lo mismo que el de arriba: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify

### Motor 3D
//Referencias a repos generales y oficiales.
- A-Frame: https://aframe.io/
- Repositorio A-Frame: https://github.com/aframevr/aframe



Si no funciona el render o bloques desacomodados en maze_3d:
Entra a asset_calibrator.html y en consola pega: 

```
localStorage.setItem('mazeAssetCalibration', `{"version":1,"cellSize":6,"assetSize":6,"wallScale":1,"assetOrigin":"center","base":{"unilateral":"N","bilateral":"NS","corner":"NW","trilateral":"WEN"},"adjust":{"unilateral":{"pos":{"x":14,"y":0,"z":0},"rotY":0,"scale":1,"lockMove":true},"bilateral":{"pos":{"x":0,"y":0,"z":0},"rotY":0,"scale":1,"lockMove":true},"corner":{"pos":{"x":21,"y":0,"z":0},"rotY":0,"scale":1,"lockMove":true},"trilateral":{"pos":{"x":28,"y":0,"z":0},"rotY":0,"scale":1,"lockMove":true},"full":{"pos":{"x":7,"y":0,"z":0},"rotY":0,"scale":1,"lockMove":true}},"refCube":{"size":6,"scale":1,"wire":true}}`);

```