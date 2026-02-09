# Generador de mapa 2D

Archivos:
- `test/maze.html` UI
- `world/map_generation/map_gen.js` motor

Main capabilities
- Modos Finito e Infino por chunks.
- Generacion de salas: rectangulares por default o mediante plantillas 16x16. Con opciones para "force template" para forzar no solo el espacio si no tambien los bordes de sala.
- Reglas de bordes: normal, sin borders, or pacmanize.
- Objetivos: entrada/salida en orillas y/o inicio/fin dentro del mapa. Ademas de colocacion automatica o manual.
- Modo vista previa: normal, tipo de bloque, direccion, o marcando todos los tipos de bloques.
- Control de lienxo: zoom, movimiento con scrolls, tamaño de celdas.

Informacion del mapa:
- Valores numericos en celdas: 
    - 0 camino 
    - 1 muro
    - 2 entrada
    - 3 salida
    - 4 inicio
    - 5 fin
