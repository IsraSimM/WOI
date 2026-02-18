const GAME_ROOT_URL = new URL('../../', import.meta.url);

export const GAME_ROOT = GAME_ROOT_URL.href;
export const GAME_DATA_URL = new URL('game_data/', GAME_ROOT_URL).href;
export const ITEMS_URL = new URL('game_data/items/latest.json', GAME_ROOT_URL).href;
export const ENTITIES_URL = new URL('game_data/entities/entities_v0.2.json', GAME_ROOT_URL).href;
export const MODES_URL = new URL('game_data/modes/modes.json', GAME_ROOT_URL).href;
export const DIFFICULTS_URL = new URL('game_data/difficults/difficults.json', GAME_ROOT_URL).href;
export const GAMEPLAY_URL = new URL('game_data/config/gameplay.json', GAME_ROOT_URL).href;
export const WORLDS_URL = new URL('game_data/worlds/', GAME_ROOT_URL).href;
export const WORLD_01_URL = new URL('game_data/worlds/world_01/map_data.json', GAME_ROOT_URL).href;
export const WORLD_01_ENTITIES_URL = new URL('game_data/worlds/world_01/entities_data.json', GAME_ROOT_URL).href;
export const WORLD_01_PLAYERS_URL = new URL('game_data/worlds/world_01/players_data.json', GAME_ROOT_URL).href;

export function resolveGameUrl(path) {
  return new URL(path, GAME_ROOT_URL).href;
}
