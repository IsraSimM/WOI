# Formatos de datos

## Items (`game_data/items/*.json`)
Array de objetos:

```
{
  "id": "power_pellet",
  "nombre": "Pastilla de Poder",
  "descripcion": "Convierte al jugador en cazador temporal",
  "tipo_efecto": "transformacion_ofensiva",
  "aplicacion": "jugador",
  "es_instantaneo": false,
  "usos": 1,
  "cooldown_ms": 12000,
  "rareza": 4,
  "efectos": { "duracion_ms": 8000 },
  "color": "#FFB8D1",
  "asset": "game_data/assets/items/power_pill.glb"
}
```

## Entidades (`game_data/entities/entities_v0.2.json`)
Objeto con `players`, `enemies`, `bots`:

```
{
  "players": [{ "id": "Personaje", "nombre": "Basico", "stats": { ... } }],
  "enemies": [{ "id": "enemy_basic", "stats": { ... } }],
  "bots": []
}
```

## Mundo (`game_data/worlds/world_01/map_data.json`)
Estructura de mapa y meta:

```
{
  "version": 1,
  "name": "world_01",
  "width": 9,
  "height": 9,
  "map": [1,1,1, ...],
  "meta": { "start": {"x":1,"y":1}, "end": {"x":7,"y":7} }
}
```

## Dificultades (`game_data/difficults/difficults.json`)
Objeto con `niveles`, multiplicadores y formulas.
