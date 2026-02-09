//Una maldita belleza, pendejo :)
//Esta padre este modulo, se encarga de crear snapshots del mundo, con toda la info necesaria para guardarlo o compartirlo, y tambien de parsear esos snapshots para volver a crear el mundo a partir de ellos. Es como el traductor entre el mundo interno del juego y un formato que se puede guardar o enviar por ahi.
//Referencias: 
//https://github.com/phaserjs/examples/blob/master/public/assets/games/pacman/map.json

//Segun la siguiente discusion sabemos ahora tambien que funcionaria bien en el 3d ajsja :)
//https://stackoverflow.com/questions/69012207/saving-my-game-objects-in-the-map-with-json-in-unity


//Considerar que este podria estar mas fuerte pero no le se:
//https://github.com/Cysharp/MemoryPack
//Tambien se puede en binarios parece o eso vi en redit :(

//Despues de investigar es medio ineficiente pero es simple y como ya sabia hacer esto maso menos asi lo deje, si se quiere mejorar se puede, pero no es urgente ni necesario, y no es tan dificil de entender, asi que por ahora esta bien asi.

export const WORLD_SCHEMA_VERSION = 1;

const nowIso = () => new Date().toISOString();

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampInt = (v, min, max) => {
  const n = Math.round(toNumber(v, min));
  return Math.max(min, Math.min(max, n));
};

const normalizeMeta = (meta = {}) => ({
  entrance: meta.entrance ?? null,
  exit: meta.exit ?? null,
  start: meta.start ?? null,
  end: meta.end ?? null,
  seed: toNumber(meta.seed, null),
  seedSource: meta.seedSource ?? null,
});

const normalizeSpawns = (spawns = {}) => ({
  items: Array.isArray(spawns.items) ? spawns.items : [],
  enemies: Array.isArray(spawns.enemies) ? spawns.enemies : [],
  allies: Array.isArray(spawns.allies) ? spawns.allies : [],
});

export function createWorldSnapshot({
  name = 'world',
  map,
  width,
  height,
  meta,
  settings = {},
  view = {},
  assets = {},
  template = {},
  spawns = {},
} = {}) {
  if (!map || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('createWorldSnapshot: faltan mapa, width o height.');
  }
  const w = clampInt(width, 1, 10000);
  const h = clampInt(height, 1, 10000);
  const data = {
    version: WORLD_SCHEMA_VERSION,
    name,
    createdAt: nowIso(),
    width: w,
    height: h,
    map: Array.from(map),
    meta: normalizeMeta(meta),
    settings: settings || {},
    view: view || {},
    assets: assets || {},
    template: template || {},
    spawns: normalizeSpawns(spawns),
  };
  return data;
}

export function serializeWorld(world, pretty = true) {
  return JSON.stringify(world, null, pretty ? 2 : 0);
}

export function parseWorld(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') {
    throw new Error('parseWorld: JSON invalido.');
  }
  const width = clampInt(data.width, 1, 10000);
  const height = clampInt(data.height, 1, 10000);
  const mapArr = Array.isArray(data.map)
    ? data.map
    : (data.map instanceof Uint8Array ? Array.from(data.map) : []);
  const expected = width * height;
  if (mapArr.length !== expected) {
    throw new Error(`parseWorld: mapa invalido (${mapArr.length} vs ${expected}).`);
  }
  return {
    ...data,
    version: toNumber(data.version, WORLD_SCHEMA_VERSION),
    width,
    height,
    map: new Uint8Array(mapArr.map((v) => clampInt(v, 0, 255))),
    meta: normalizeMeta(data.meta || {}),
    spawns: normalizeSpawns(data.spawns || {}),
  };
}
