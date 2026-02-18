export function createWorldState({
  map,
  width,
  height,
  meta = {},
  items = [],
  enemies = [],
  playerSpawn = null,
  mode = 'modo_classic',
  difficulty = 'normal',
} = {}) {
  return {
    map,
    width,
    height,
    meta,
    items,
    enemies,
    playerSpawn,
    mode,
    difficulty,
  };
}
