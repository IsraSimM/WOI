# Arquitectura

## Resumen
El proyecto se organiza en tres capas principales:

- **game_data/**: JSON y assets (GLB/PNG).
- **game_engine/**: motor (generacion, sistemas, render, persistencia).
- **game_system/**: pantallas, UI y bootstrap.

## Flujo de datos
1. `game_system/app.js` inicia el juego en `game.html`.
2. `game_engine/data/*` carga JSON (items, entidades, mundos).
3. `game_engine/world/loader.js` genera o carga el mundo.
4. `game_engine/render/aframe_adapter.js` construye la escena 3D.
5. Sistemas del mundo (movimiento, colisiones, items, IA) actualizan el estado.
6. `game_system/ui/hud/*` refleja el estado al jugador.

## Modulos clave
- `game_engine/generation/world_generation/map.js`: generacion de laberintos.
- `game_engine/world/saver.js`: serializacion de mundos.
- `game_engine/world/systems/*`: logica de juego (MVP).
- `game_engine/render/*`: construccion de escena A-Frame.
- `game_system/app.js`: orquestacion general.
