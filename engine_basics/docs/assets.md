# Recursos

## Recursos de bloques
Location: `assets/blocks`

Archivos
- `unilateral.glb` apertura única (un lado abierto, tres lados bloqueados)
- `bilateral.glb` pasillo recto (dos lados opuestos abiertos)
- `bilateral_corner.glb` pasillo en esquina (dos lados adyacentes abiertos)
- `trilateral.glb` intersección de tres vías (tres lados abiertos)
- `full.glb` bloque cerrado (todos los lados bloqueados)

La orientación y los desplazamientos se configuran mediante la interfaz del calibrador:
- `test/asset_calibrator.html`
- Almacenado en localStorage bajo `mazeAssetCalibration`

## Recursos de ítems
Location: `assets/items`

Las definiciones de ítems están en `game_data/items/items.json` y incluyen:
- `id`, `name`, `description`, `color`
- `asset` ruta relativa al repositorio (p. ej. `assets/items/speeder.glb`)
- Opcional: por ítem, `scale` y `yOffset` para la colocación

Variantes de trampa disponibles como archivos `*_trap.glb` para los ítems correspondientes.

---
**Consideracion:**
No son funcionales aun y faltan scripts de generacion o preparaciond e mundo para items :(