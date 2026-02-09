# Cargador de Laberinto 3D

Archivos
- `test/maze_3d.html` UI (A-Frame)
- `world/map_generation/map_gen.js` generador
- `world/world_procesing/world_saver.js` exportación/importación de instantáneas del mundo

Capacidades principales
- Genera un laberinto con el mismo motor usado por la herramienta 2D.
- Usa activos de bloques GLB desde `assets/blocks`.
- La altura de las paredes usa bloques apilados (no estirados).
- Techo opcional que cubre toda el área del laberinto.
- Vista previa de minimapa.
- Guardar/cargar mundos en localStorage y exportar/importar JSON.
- La configuración de calibración de activos se lee desde la interfaz del calibrador (ver `test/asset_calibrator.html`).

Notas
- La interfaz 3D expone controles de tamaño, semilla, configuración de habitaciones, bordes y objetivo, similares a la herramienta 2D.
- Si los activos están desalineados, se debe volver a ejecutar el calibrador y recarga la página 3D.
