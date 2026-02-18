# Game (MVP A-Frame)

Este directorio `game/` es la **fuente de verdad** del proyecto. Las carpetas en la raíz (`engine_basics/`, `game_data/`, `game_engine/`, `game_system/`) se consideran **referencia histórica/prototipos**.

## Estructura
- `game_data/`: datos y assets del juego (JSON + GLB)
- `game_engine/`: motor (generación de mundo, sistemas, render)
- `game_system/`: pantallas, UI y bootstrap del juego
- `tools/`: utilidades de desarrollo
- `docs/`: documentación

## Convenciones (ES modules)
- Todos los scripts de aplicación se cargan con `type="module"`.
- Las rutas se resuelven relativo al root `game/` usando `import.meta.url` en los módulos de engine.
- Los datos se cargan vía `fetch` desde `game_data/`.

## Inicio rápido
1. Levanta un servidor HTTP estático en la raíz del repo.
2. Abre `game/game_system/screens/index.html`.
3. Inicia partida (MVP) para cargar `game.html`.

> Nota: A-Frame se carga desde CDN, no se usa bundler.
