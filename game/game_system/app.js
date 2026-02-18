import CONFIG from '../game_engine/core/config.js';
import { CELL } from '../game_engine/core/constants.js';
import { startLoop } from '../game_engine/core/time.js';
import { logger } from '../game_engine/core/logger.js';
import { fetchJson } from '../game_engine/data/json_loader.js';
import {
  ITEMS_URL,
  ENTITIES_URL,
  MODES_URL,
  DIFFICULTS_URL,
  GAMEPLAY_URL,
  WORLD_01_URL,
  WORLD_01_ENTITIES_URL,
  WORLD_01_PLAYERS_URL,
  resolveGameUrl,
} from '../game_engine/data/paths.js';
import { loadWorld, worldToCell, isWall } from '../game_engine/world/loader.js';
import { createWorldState } from '../game_engine/world/world_state.js';
import { createWorldSnapshot, parseWorld } from '../game_engine/world/saver.js';
import { buildWorldScene } from '../game_engine/render/aframe_adapter.js';
import { ensureAssets } from '../game_engine/render/asset_cache.js';
import { createCullingSystem } from '../game_engine/render/visibility_culling.js';
import { registerPlayerAnimator } from '../game_engine/render/player_animator.js';
import { createCollisionSystem } from '../game_engine/world/systems/collision_system.js';
import { registerMovementSystem, registerStepBob } from '../game_engine/world/systems/movement_system.js';
import { createAISystem } from '../game_engine/world/systems/ai_system.js';
import { createCombatSystem } from '../game_engine/world/systems/combat_system.js';
import { createItemSystem } from '../game_engine/world/systems/item_system.js';
import { createSpawnSystem } from '../game_engine/world/systems/spawn_system.js';
import { mountHud } from './ui/hud/hud.js';
import { generateSpawnPoints } from '../game_engine/generation/world_generation/spawns.js';

const LEGACY_SAVE_KEY = 'world_snapshot_v1';
const SAVE_LIST_KEY = 'world_snapshots_v1';
const SAVE_LATEST_KEY = 'world_snapshot_latest_v1';
const AUTO_SAVE_ID = 'auto_latest';
const AUTO_SAVE_INTERVAL_MS = 45000;
const CONFIG_KEY = 'game_config_v1';
const ENGINE_CONFIG_KEY = 'engine_config_v1';
const LEVELS_PROGRESS_KEY = 'levels_progress_v1';
const FINAL_DURATION_MS = 20000;
const FINAL_SPAWN_INTERVAL_MS = 3000;
const FRENZY_SPEED_MULT = 1.35;
const FRENZY_COOLDOWN_MULT = 0.6;

const PLAYER_MODEL = {
  asset: 'game_data/assets/characters/tainted_bot.glb',
  scale: 0.75,
  yOffset: 0,
};

const ENEMY_MODEL = {
  asset: 'game_data/assets/characters/enemy.glb',
  scale: 0.7,
  yOffset: 0,
  yawOffset: Math.PI,
};

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function findCellWithValue(map, width, height, value) {
  if (!map || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const total = width * height;
  for (let idx = 0; idx < total; idx++) {
    if (map[idx] === value) {
      const y = Math.floor(idx / width);
      const x = idx - (y * width);
      return { x, y };
    }
  }
  return null;
}

function resolveGoalCell(meta, map, width, height) {
  if (meta?.end) return meta.end;
  if (meta?.exit) return meta.exit;
  return findCellWithValue(map, width, height, CELL.END) || findCellWithValue(map, width, height, CELL.EXIT);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { autosaveOnExit: true };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { autosaveOnExit: true };
    if (typeof data.autosaveOnExit !== 'boolean') data.autosaveOnExit = true;
    return data;
  } catch {
    return { autosaveOnExit: true };
  }
}

function loadEngineConfig() {
  const defaults = {
    cullingEnabled: true,
    cullingDistance: 60,
    minimapRadius: 10,
    dashDistance: 12,
    dashCooldown: 1.5,
    dashWalls: 1,
    invulnMs: 5000,
    lodMode: 'balanced',
    shadowsEnabled: false,
    fogEnabled: true,
    fogFar: 120,
  };
  try {
    const raw = localStorage.getItem(ENGINE_CONFIG_KEY);
    if (!raw) return defaults;
    const cfg = JSON.parse(raw);
    return {
      cullingEnabled: typeof cfg.cullingEnabled === 'boolean' ? cfg.cullingEnabled : defaults.cullingEnabled,
      cullingDistance: Number.isFinite(cfg.cullingDistance) ? cfg.cullingDistance : defaults.cullingDistance,
      minimapRadius: Number.isFinite(cfg.minimapRadius) ? cfg.minimapRadius : defaults.minimapRadius,
      dashDistance: Number.isFinite(cfg.dashDistance) ? cfg.dashDistance : defaults.dashDistance,
      dashCooldown: Number.isFinite(cfg.dashCooldown) ? cfg.dashCooldown : defaults.dashCooldown,
      dashWalls: Number.isFinite(cfg.dashWalls) ? cfg.dashWalls : defaults.dashWalls,
      invulnMs: Number.isFinite(cfg.invulnMs) ? cfg.invulnMs : defaults.invulnMs,
      lodMode: typeof cfg.lodMode === 'string' ? cfg.lodMode : defaults.lodMode,
      shadowsEnabled: typeof cfg.shadowsEnabled === 'boolean' ? cfg.shadowsEnabled : defaults.shadowsEnabled,
      fogEnabled: typeof cfg.fogEnabled === 'boolean' ? cfg.fogEnabled : defaults.fogEnabled,
      fogFar: Number.isFinite(cfg.fogFar) ? cfg.fogFar : defaults.fogFar,
    };
  } catch {
    return defaults;
  }
}

function normalizeOdd(value, fallback) {
  let n = Number(value);
  if (!Number.isFinite(n)) n = fallback;
  n = Math.max(5, Math.round(n));
  if (n % 2 === 0) n += 1;
  return n;
}

function ammoProfileForDifficulty(diff) {
  const key = String(diff || 'normal').toLowerCase();
  const profiles = {
    facil: { capacity: 1.15, start: 1.0 },
    normal: { capacity: 1.0, start: 0.9 },
    dificil: { capacity: 0.85, start: 0.75 },
    experto: { capacity: 0.75, start: 0.6 },
    pesadilla: { capacity: 0.65, start: 0.5 },
  };
  return profiles[key] || profiles.normal;
}

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SAVE_LIST_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveSnapshots(list) {
  localStorage.setItem(SAVE_LIST_KEY, JSON.stringify(list));
}

function getSnapshotWorldId(snapshot) {
  return snapshot?.settings?.worldId || snapshot?.meta?.name || snapshot?.name || null;
}

function pruneSnapshotsForWorld(list, worldId, keepId) {
  if (!worldId) return list;
  return list.filter((entry) => entry.id === keepId || getSnapshotWorldId(entry.data) !== worldId);
}

function loadLevelProgress() {
  try {
    const raw = localStorage.getItem(LEVELS_PROGRESS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLevelProgress(list) {
  localStorage.setItem(LEVELS_PROGRESS_KEY, JSON.stringify(list));
}

function markLevelCompleted(worldId) {
  if (!worldId) return;
  const id = String(worldId);
  if (!id.startsWith('world_')) return;
  const list = loadLevelProgress();
  if (list.includes(id)) return;
  list.push(id);
  saveLevelProgress(list);
}

function migrateLegacySnapshot() {
  const list = loadSnapshots();
  if (list.length) return;
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return;
    const data = parseWorld(raw);
    const entry = {
      id: `legacy_${Date.now()}`,
      name: data.name || 'Legacy Save',
      createdAt: data.createdAt || new Date().toISOString(),
      data,
    };
    saveSnapshots([entry]);
    localStorage.setItem(SAVE_LATEST_KEY, entry.id);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // ignore
  }
}

function loadSnapshotById(id) {
  if (!id) return null;
  const list = loadSnapshots();
  const entry = list.find((s) => s.id === id);
  return entry || null;
}

function loadLatestSnapshot() {
  const list = loadSnapshots();
  if (!list.length) return null;
  const latestId = localStorage.getItem(SAVE_LATEST_KEY);
  if (latestId) {
    const entry = list.find((s) => s.id === latestId);
    if (entry) return entry;
  }
  return list[list.length - 1];
}

function addSnapshot(snapshotData, name) {
  const list = loadSnapshots();
  const id = `save_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    name: name || snapshotData.name || 'World',
    createdAt: snapshotData.createdAt || new Date().toISOString(),
    data: snapshotData,
  };
  const worldId = getSnapshotWorldId(snapshotData);
  const next = pruneSnapshotsForWorld(list, worldId, id);
  next.push(entry);
  saveSnapshots(next);
  localStorage.setItem(SAVE_LATEST_KEY, entry.id);
  return entry;
}

function upsertSnapshot(snapshotData, name, id = AUTO_SAVE_ID) {
  const list = loadSnapshots();
  const entry = {
    id,
    name: name || snapshotData.name || 'Auto',
    createdAt: snapshotData.createdAt || new Date().toISOString(),
    data: snapshotData,
  };
  const worldId = getSnapshotWorldId(snapshotData);
  const next = pruneSnapshotsForWorld(list, worldId, id);
  const idx = next.findIndex((s) => s.id === id);
  if (idx >= 0) next[idx] = entry;
  else next.push(entry);
  saveSnapshots(next);
  localStorage.setItem(SAVE_LATEST_KEY, entry.id);
  return entry;
}

function buildWorldStateFromSnapshot(snapshot) {
  const map = snapshot.map instanceof Uint8Array ? snapshot.map : new Uint8Array(snapshot.map || []);
  const meta = snapshot.meta || {};
  if (!meta.name && snapshot.settings?.worldId) meta.name = snapshot.settings.worldId;
  return createWorldState({
    map,
    width: snapshot.width,
    height: snapshot.height,
    meta,
    items: snapshot.spawns?.items || [],
    enemies: snapshot.spawns?.enemies || [],
    playerSpawn: snapshot.settings?.playerSpawn || snapshot.meta?.start || { x: 1, y: 1 },
    mode: snapshot.settings?.mode || 'modo_classic',
    difficulty: snapshot.settings?.difficulty || 'normal',
  });
}

function saveSnapshot({
  worldState,
  itemSystem,
  enemyEntities,
  playerEl,
  playerState,
  cellSize,
  wallHeight,
  score = 0,
  killCount = 0,
  saveName,
  saveId = null,
}) {
  const playerCell = worldToCell(playerEl.object3D.position, cellSize);
  const items = itemSystem.getRemaining();
  const enemies = enemyEntities.map((enemy) => {
    const cell = worldToCell(enemy.el.object3D.position, cellSize);
    return {
      id: enemy.id,
      x: cell.x,
      y: cell.y,
      behavior: enemy.behavior,
    };
  });

  const snapshot = createWorldSnapshot({
    name: saveName || worldState.meta?.name || 'world',
    map: worldState.map,
    width: worldState.width,
    height: worldState.height,
    meta: worldState.meta,
    spawns: { items, enemies },
    settings: {
      worldId: worldState.meta?.name || worldState.meta?.id || worldState.name || null,
      mode: worldState.mode,
      difficulty: worldState.difficulty,
      playerSpawn: playerCell,
      playerAttemptsUsed: playerState.attemptsUsed,
      playerAttemptsLimit: playerState.attemptsLimit,
      playerHealth: playerState.health,
      playerLives: Math.max(0, playerState.attemptsLimit - playerState.attemptsUsed),
      playerScore: Math.max(0, Math.round(score || 0)),
      playerKills: Math.max(0, Math.round(killCount || 0)),
      mapWidth: worldState.width,
      mapHeight: worldState.height,
      wallHeight: Number.isFinite(wallHeight) ? wallHeight : null,
    },
  });
  if (Number.isFinite(wallHeight)) snapshot.wallHeight = Math.round(wallHeight);

  if (saveId) upsertSnapshot(snapshot, saveName, saveId);
  else addSnapshot(snapshot, saveName);
  return snapshot;
}

function resolveBehavior(id, behavior) {
  if (behavior) return behavior;
  if (id === 'enemy_advanced' || id === 'enemy_strategist') return 'ambusher';
  if (id === 'enemy_speedster') return 'wanderer';
  if (id === 'enemy_ranged') return 'ranged';
  return 'chaser';
}

async function initGame() {
  const sceneEl = document.querySelector('#scene');
  if (!sceneEl) return;

  const playerEl = document.querySelector('#player');
  const cameraEl = playerEl?.querySelector('[camera]');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const startOverlay = document.getElementById('startOverlay');
  const downOverlay = document.getElementById('downOverlay');
  const respawnBtn = document.getElementById('respawnBtn');
  const startBtn = document.getElementById('startBtn');
  const startObjective = document.getElementById('startObjective');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultMessage = document.getElementById('resultMessage');
  const resultStats = document.getElementById('resultStats');
  const resultRestart = document.getElementById('resultRestart');
  const resultSaveExit = document.getElementById('resultSaveExit');
  const resultExit = document.getElementById('resultExit');
  const hudRoot = document.getElementById('hud-root');
  const hud = await mountHud(hudRoot);
  registerPlayerAnimator();

  const introAudio = new Audio(resolveGameUrl('game_data/assets/audio/enviroment/intro.wav'));
  const loopAudio = new Audio(resolveGameUrl('game_data/assets/audio/enviroment/loop.wav'));
  introAudio.preload = 'auto';
  loopAudio.preload = 'auto';
  loopAudio.loop = true;
  let audioStarted = false;
  let audioPaused = false;
  const stepAudioPool = Array.from({ length: 3 }, () => {
    const audio = new Audio(resolveGameUrl('game_data/assets/audio/sounds/character/paso.wav'));
    audio.preload = 'auto';
    audio.volume = 0.55;
    return audio;
  });
  const shotAudioPool = Array.from({ length: 4 }, () => {
    const audio = new Audio(resolveGameUrl('game_data/assets/audio/sounds/character/disparo.wav'));
    audio.preload = 'auto';
    audio.volume = 0.5;
    return audio;
  });
  let stepIndex = 0;
  let shotIndex = 0;
  let lastStepAt = 0;

  introAudio.addEventListener('ended', () => {
    if (!audioStarted) return;
    const playPromise = loopAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  });

  function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    audioPaused = false;
    introAudio.currentTime = 0;
    loopAudio.currentTime = 0;
    const playPromise = introAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        audioStarted = false;
      });
    }
  }

  function stopAudio() {
    audioStarted = false;
    audioPaused = false;
    introAudio.pause();
    loopAudio.pause();
    stepAudioPool.forEach((audio) => audio.pause());
    shotAudioPool.forEach((audio) => audio.pause());
  }

  function pauseAudio() {
    if (!audioStarted || audioPaused) return;
    audioPaused = true;
    introAudio.pause();
    loopAudio.pause();
    stepAudioPool.forEach((audio) => audio.pause());
    shotAudioPool.forEach((audio) => audio.pause());
  }

  function resumeAudio() {
    if (!audioStarted || !audioPaused) return;
    audioPaused = false;
    const target = (introAudio.ended || introAudio.currentTime >= introAudio.duration) ? loopAudio : introAudio;
    const playPromise = target.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function playFootstep() {
    if (!audioStarted) return;
    const audio = stepAudioPool[stepIndex++ % stepAudioPool.length];
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function playShot() {
    if (!audioStarted) return;
    const audio = shotAudioPool[shotIndex++ % shotAudioPool.length];
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function setLoading(active, text) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle('active', active);
    if (loadingText && text) loadingText.textContent = text;
  }

  async function waitForAssets(scene, timeoutMs = 4000) {
    const assets = scene?.querySelector?.('a-assets');
    if (!assets || assets.hasLoaded) return;
    await Promise.race([
      new Promise((resolve) => assets.addEventListener('loaded', resolve, { once: true })),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  const setup = async () => {
    migrateLegacySnapshot();

    setLoading(true, 'Preparando sistema...');

    const [rawItemsData, rawEntitiesData, rawModesData, rawDifficultsData, rawGameplayData] = await Promise.all([
      fetchJson(ITEMS_URL),
      fetchJson(ENTITIES_URL),
      fetchJson(MODES_URL),
      fetchJson(DIFFICULTS_URL),
      fetchJson(GAMEPLAY_URL),
    ]);

    const fixText = (value) => {
      if (typeof value !== 'string') return value;
      if (!/[ÃÂ]/.test(value)) return value;
      try {
        return decodeURIComponent(escape(value));
      } catch {
        return value;
      }
    };

    const gameplayData = rawGameplayData && typeof rawGameplayData === 'object' ? rawGameplayData : {};
    const finalCfg = gameplayData?.final_phase || {};
    const finalDurationMs = Math.max(5000, Number(finalCfg.duration_ms) || FINAL_DURATION_MS);
    const finalSpawnIntervalMs = Math.max(400, Number(finalCfg.spawn_interval_ms) || FINAL_SPAWN_INTERVAL_MS);
    const frenzySpeedMult = Math.max(0.2, Number(finalCfg.frenzy_speed_mult) || FRENZY_SPEED_MULT);
    const frenzyCooldownMult = Math.max(0.1, Number(finalCfg.frenzy_cooldown_mult) || FRENZY_COOLDOWN_MULT);
    const itemsData = Array.isArray(rawItemsData)
      ? rawItemsData.map((item) => ({
        ...item,
        nombre: fixText(item?.nombre),
        descripcion: fixText(item?.descripcion),
      }))
      : [];

    const entitiesData = (() => {
      const fixList = (list) => (Array.isArray(list)
        ? list.map((entry) => ({
          ...entry,
          nombre: fixText(entry?.nombre),
          descripcion: fixText(entry?.descripcion),
        }))
        : []);
      return {
        ...rawEntitiesData,
        enemies: fixList(rawEntitiesData?.enemies),
        players: fixList(rawEntitiesData?.players),
        bots: fixList(rawEntitiesData?.bots),
      };
    })();
    const modesData = rawModesData && typeof rawModesData === 'object' ? rawModesData : {};
    const difficultsData = rawDifficultsData && typeof rawDifficultsData === 'object' ? rawDifficultsData : {};

    const config = loadConfig();
    const engineConfig = loadEngineConfig();
    const params = new URLSearchParams(window.location.search);
    const loadMode = params.get('load') || 'auto';
    const saveId = params.get('id');
    const paramMode = params.get('mode');
    const paramDiff = params.get('difficulty');
    const paramWidth = Number(params.get('width'));
    const paramHeight = Number(params.get('height'));
    const paramSeed = params.get('seed');
    const paramPacman = params.get('pacman') === '1' || params.get('pacman') === 'true';
    const paramWallHeight = Number(params.get('wallHeight'));
    const paramWorldName = params.get('name');
    const selectedMode = paramMode || config.mode || 'modo_classic';
    const modeGameplayById = (id) => (gameplayData?.modes?.[id] || {});
    let activeModeGameplay = modeGameplayById(selectedMode);
    const modeConfig = Array.isArray(modesData?.modos)
      ? modesData.modos.find((mode) => mode.id === selectedMode)
      : null;

    const playerDefs = Array.isArray(entitiesData?.players) ? entitiesData.players : [];
    const playerDef = playerDefs.find((p) => p.id === config.playerId) || playerDefs[0] || {};
    const playerStats = playerDef.stats || {};
    const playerDetection = Number(playerStats.deteccion) || 120;
    const computedDetectionCells = Math.max(3, Math.min(12, Math.round(playerDetection / 20)));
    const playerDetectionCells = playerDef?.id === 'Personaje' ? 7 : computedDetectionCells;
    const playerStrategy = Number(playerStats.estrategia) || 1;
    const inventorySize = Math.max(3, Math.min(8, 3 + Math.round(playerStrategy)));

    const paramMinimapRadius = Number(params.get('minimapRadius'));
    const configMinimapRadius = Number(gameplayData?.minimap?.radius_cells);
    const baseMinimapRadius = Math.max(
      10,
      playerDetectionCells,
      Number(engineConfig.minimapRadius) || 0,
      Number.isFinite(configMinimapRadius) ? configMinimapRadius : 0,
    );
    const minimapRadius = Math.max(
      3,
      Number.isFinite(paramMinimapRadius) ? paramMinimapRadius : baseMinimapRadius,
    );

    const cameraFirstPos = { x: 0, y: 1.7, z: 0 };

    const allowedBoosts = Array.isArray(modeConfig?.boosts_disponibles)
      ? modeConfig.boosts_disponibles
      : null;
    const spawnableItemIds = Array.isArray(itemsData)
      ? Array.from(new Set(itemsData
        .filter((item) => item && item.asset)
        .filter((item) => !allowedBoosts || allowedBoosts.includes(item.id))
        .map((item) => item.id)))
      : [];
    const hasAmmoLight = Array.isArray(itemsData) && itemsData.some((item) => item?.id === 'ammo_light');
    const hasAmmoHeavy = Array.isArray(itemsData) && itemsData.some((item) => item?.id === 'ammo_heavy');
    const enemyDefs = Array.isArray(entitiesData?.enemies) ? entitiesData.enemies : [];
    const allowedEnemies = Array.isArray(modeConfig?.enemigos_disponibles)
      ? modeConfig.enemigos_disponibles
      : null;
    const enemyIds = Array.from(new Set(enemyDefs
      .filter((enemy) => enemy && enemy.asset)
      .filter((enemy) => !allowedEnemies || allowedEnemies.includes(enemy.id))
      .map((enemy) => enemy.id)));
    const enemyDefById = new Map(enemyDefs.map((enemy) => [enemy.id, enemy]));

    let snapshotEntry = null;
    if (loadMode === 'save' && saveId) snapshotEntry = loadSnapshotById(saveId);
    if (!snapshotEntry && (loadMode === 'latest' || loadMode === 'auto')) snapshotEntry = loadLatestSnapshot();
    const shouldAutoStart = Boolean(snapshotEntry);

    let worldState;
    let attemptsLimit = Number(config.lives) || 3;
    let attemptsUsed = 0;
    let playerHealth = 100;
    const healthMax = 100;
    let worldArea = 0;
    let worldId = null;
    let snapshotWallHeight = null;
    let snapshotScore = null;
    let snapshotKills = null;
    const requestedDifficulty = paramDiff || config.difficulty || 'normal';
    const difficultyForGeneration = difficultsData?.niveles?.[requestedDifficulty] || {};

    if (snapshotEntry && loadMode !== 'new' && loadMode !== 'world_01') {
      setLoading(true, 'Cargando snapshot...');
      worldState = buildWorldStateFromSnapshot(snapshotEntry.data);
      worldArea = worldState.width * worldState.height;
      const settings = snapshotEntry.data.settings || {};
      worldId = settings.worldId || snapshotEntry.data?.meta?.name || snapshotEntry.data?.name || null;
      if (Number.isFinite(settings.wallHeight)) snapshotWallHeight = settings.wallHeight;
      if (Number.isFinite(snapshotEntry.data?.wallHeight)) snapshotWallHeight = snapshotEntry.data.wallHeight;
      if (Number.isFinite(settings.playerScore)) snapshotScore = settings.playerScore;
      if (Number.isFinite(settings.playerKills)) snapshotKills = settings.playerKills;
      if (Number.isFinite(settings.playerAttemptsLimit)) {
        attemptsLimit = Math.max(1, Math.round(settings.playerAttemptsLimit));
      } else if (Number.isFinite(settings.playerLives)) {
        attemptsLimit = Math.max(1, Math.round(settings.playerLives));
      }
      if (Number.isFinite(settings.playerAttemptsUsed)) {
        attemptsUsed = Math.max(0, Math.round(settings.playerAttemptsUsed));
      } else if (Number.isFinite(settings.playerLives)) {
        attemptsUsed = Math.max(0, attemptsLimit - Math.round(settings.playerLives));
      }
      if (Number.isFinite(settings.playerHealth)) {
        playerHealth = settings.playerHealth;
      }
    } else {
      const width = normalizeOdd(
        Number.isFinite(paramWidth) ? paramWidth : config.worldWidth,
        CONFIG.defaults.worldWidth,
      );
      const height = normalizeOdd(
        Number.isFinite(paramHeight) ? paramHeight : config.worldHeight,
        CONFIG.defaults.worldHeight,
      );
      const worldLoadId = loadMode && loadMode.startsWith('world_') ? loadMode : null;
      const useWorld01 = loadMode === 'world_01';
      worldId = worldLoadId || null;
      worldArea = width * height;
      const diffSpawn = difficultyForGeneration?.multiplicadores?.spawns || {};
      const diffItems = difficultyForGeneration?.multiplicadores?.items || {};
      const modeItemsMult = Number(activeModeGameplay?.initial_items_mult) || 1;
      const modeEnemiesMult = Number(activeModeGameplay?.initial_enemies_mult) || 1;
      const spawnNum = Number(diffSpawn.numero_enemigos) || 1;
      const spawnDensity = Number(diffSpawn.densidad_enemigos) || 1;
      const itemsMult = Number(diffItems.boost_spawn_mult) || 1;
      const itemsCount = Math.max(8, Math.round((worldArea / 100) * itemsMult * modeItemsMult));
      const enemiesCount = Math.max(enemyIds.length * 3, Math.round(itemsCount * 3 * spawnNum * spawnDensity * modeEnemiesMult));
      if (worldArea >= 900) {
        setLoading(true, 'Generando mundo grande...');
      } else {
        setLoading(true, 'Generando mundo...');
      }
      worldState = await loadWorld({
        worldUrl: worldLoadId ? resolveGameUrl(`game_data/worlds/${worldLoadId}/map_data.json`) : (useWorld01 ? WORLD_01_URL : null),
        entitiesUrl: worldLoadId ? resolveGameUrl(`game_data/worlds/${worldLoadId}/entities_data.json`) : (useWorld01 ? WORLD_01_ENTITIES_URL : null),
        playersUrl: worldLoadId ? resolveGameUrl(`game_data/worlds/${worldLoadId}/players_data.json`) : (useWorld01 ? WORLD_01_PLAYERS_URL : null),
        width,
        height,
        seed: paramSeed || config.seed || null,
        pacmanize: paramPacman,
        openBorders: false,
        itemIds: spawnableItemIds,
        enemyIds,
        itemsCount,
        enemiesCount,
      });
      if (paramMode || config.mode) worldState.mode = paramMode || config.mode;
      if (paramDiff || config.difficulty) worldState.difficulty = paramDiff || config.difficulty;
      if (paramWorldName) {
        worldState.meta = worldState.meta || {};
        worldState.meta.name = paramWorldName;
      }
    }

    if (worldId) {
      worldState.meta = worldState.meta || {};
      if (!worldState.meta.name) worldState.meta.name = worldId;
    }

    activeModeGameplay = modeGameplayById(worldState.mode || selectedMode);

    const itemIdSet = new Set(spawnableItemIds);
    if (hasAmmoLight) itemIdSet.add('ammo_light');
    if (hasAmmoHeavy) itemIdSet.add('ammo_heavy');
    if (Array.isArray(worldState?.items)) {
      worldState.items = worldState.items.filter((entry) => entry && itemIdSet.has(entry.id));
    }

    if (Array.isArray(worldState?.items) && (hasAmmoLight || hasAmmoHeavy)) {
      const occupied = new Set(worldState.items.map((entry) => `${entry.x},${entry.y}`));
      const borderCells = [];
      const avoid = new Set();
      if (worldState.meta?.start) avoid.add(`${worldState.meta.start.x},${worldState.meta.start.y}`);
      if (worldState.meta?.end) avoid.add(`${worldState.meta.end.x},${worldState.meta.end.y}`);

      const ring = 1;
      for (let y = 1; y < worldState.height - 1; y++) {
        for (let x = 1; x < worldState.width - 1; x++) {
          const nearBorder =
            x <= ring || y <= ring || x >= worldState.width - 1 - ring || y >= worldState.height - 1 - ring;
          if (!nearBorder) continue;
          if (isWall(worldState.map, worldState.width, worldState.height, x, y)) continue;
          const key = `${x},${y}`;
          if (occupied.has(key) || avoid.has(key)) continue;
          borderCells.push({ x, y });
        }
      }

      const targetCount = Math.max(8, Math.round((worldState.width + worldState.height) * 0.45));
      for (let i = borderCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = borderCells[i];
        borderCells[i] = borderCells[j];
        borderCells[j] = tmp;
      }

      const ammoEntries = [];
      for (const cell of borderCells) {
        if (ammoEntries.length >= targetCount) break;
        const key = `${cell.x},${cell.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        let id = 'ammo_light';
        if (hasAmmoLight && hasAmmoHeavy) {
          id = Math.random() < 0.75 ? 'ammo_light' : 'ammo_heavy';
        } else if (!hasAmmoLight && hasAmmoHeavy) {
          id = 'ammo_heavy';
        }
        ammoEntries.push({ id, x: cell.x, y: cell.y });
      }
      if (ammoEntries.length) {
        worldState.items = worldState.items.concat(ammoEntries);
      }
    }

    const cellSize = CONFIG.defaults.cellSize;
    const wallHeight = Number.isFinite(paramWallHeight)
      ? Math.max(1, Math.round(paramWallHeight))
      : (Number.isFinite(snapshotWallHeight) ? Math.max(1, Math.round(snapshotWallHeight)) : CONFIG.defaults.wallHeight);
    const lodMode = engineConfig.lodMode || 'balanced';
    const lodFactor = lodMode === 'aggressive' ? 0.7 : lodMode === 'quality' ? 1.2 : 1;

    const { walls } = buildWorldScene({
      sceneEl,
      map: worldState.map,
      width: worldState.width,
      height: worldState.height,
      cellSize,
      wallHeight,
      meta: worldState.meta,
      shadowsEnabled: engineConfig.shadowsEnabled,
    });

    const playerAssetPath = playerDef?.asset || PLAYER_MODEL.asset;
    const playerAssetUrl = encodeURI(resolveGameUrl(playerAssetPath));
    const enemyAssetUrl = encodeURI(resolveGameUrl(ENEMY_MODEL.asset));
    ensureAssets(sceneEl, [
      { id: 'mdl-player', src: playerAssetUrl },
      { id: 'mdl-enemy', src: enemyAssetUrl },
    ]);

    if (engineConfig.shadowsEnabled) {
      sceneEl.setAttribute('renderer', 'antialias: true; colorManagement: true; shadowMapEnabled: true');
    } else {
      sceneEl.setAttribute('renderer', 'antialias: true; colorManagement: true; shadowMapEnabled: false');
    }

    if (engineConfig.fogEnabled) {
      const fogFar = Math.max(40, engineConfig.fogFar || 120);
      const fogNear = Math.max(10, Math.round(fogFar * 0.25));
      sceneEl.setAttribute('fog', `type: linear; color: #0b0f15; near: ${fogNear}; far: ${fogFar}`);
    } else {
      sceneEl.removeAttribute('fog');
    }

    setLoading(true, 'Cargando assets...');
    await waitForAssets(sceneEl, worldArea >= 900 ? 6000 : 3500);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const collisionSystem = createCollisionSystem(
      worldState.map,
      worldState.width,
      worldState.height,
      cellSize,
      wallHeight * cellSize,
    );

    const playerBodyEl = document.createElement('a-entity');
    playerBodyEl.setAttribute('id', 'player-body');
    playerBodyEl.setAttribute('gltf-model', '#mdl-player');
    playerBodyEl.setAttribute('player-animator', 'idle: idle; walk: walk; attack: atack; death: death; jump: jump;');
    const playerScale = PLAYER_MODEL.scale || 0.6;
    playerBodyEl.setAttribute('scale', `${playerScale} ${playerScale} ${playerScale}`);
    if (engineConfig.shadowsEnabled) {
      playerBodyEl.setAttribute('shadow', 'cast: true; receive: false');
    }
    playerEl.appendChild(playerBodyEl);

    playerBodyEl.addEventListener('model-error', () => {
      playerBodyEl.removeAttribute('gltf-model');
      playerBodyEl.setAttribute('geometry', 'primitive: box; height: 1.8; width: 0.7; depth: 0.4');
      playerBodyEl.setAttribute('material', 'color: #25f3ff; metalness: 0.2; roughness: 0.5');
    }, { once: true });

    playerBodyEl.addEventListener('model-loaded', () => {
      const mesh = playerBodyEl.getObject3D('mesh');
      if (!mesh || !window.THREE) return;
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      const yOffset = Number(PLAYER_MODEL.yOffset) || 0;
      playerBodyEl.object3D.position.x = 0;
      playerBodyEl.object3D.position.z = 0;
      playerBodyEl.object3D.position.y = -box.min.y + yOffset;
      playerBodyEl.object3D.updateMatrixWorld(true);

      const animator = playerBodyEl.components?.['player-animator'];
      const duration = animator?.getClipDuration?.('attack') || animator?.getClipDuration?.('atack');
      if (duration) {
        attackCooldownMs = Math.max(250, duration * 1000);
      }
    }, { once: true });

    registerMovementSystem({ collisionSystem, bodyEl: playerBodyEl });
    registerStepBob();
    playerEl.setAttribute('room-player', {
      dashDistance: cellSize * 3,
      dashCooldown: engineConfig.dashCooldown,
      dashWalls: engineConfig.dashWalls,
      sprintMult: 1.6,
      dashKey: '',
    });

    if (cameraEl) {
      cameraEl.setAttribute('position', `${cameraFirstPos.x} ${cameraFirstPos.y} ${cameraFirstPos.z}`);
    }

    const spawn = worldState.playerSpawn || { x: 1, y: 1 };
    playerEl.setAttribute('position', `${spawn.x * cellSize} 0 ${spawn.y * cellSize}`);
    const lastPlayerPos = new THREE.Vector3().copy(playerEl.object3D.position);
    let currentMoveSpeed = 0;
    let currentPlayerAnim = null;
    let attackUntil = 0;

    let attackCooldownMs = 520;
    let lastAttackAt = -Infinity;
    let combatSystem = null;

    const playerState = {
      healthMax,
      health: Math.max(0, Math.min(healthMax, Number(playerHealth) || healthMax)),
      attemptsLimit: Math.max(1, Math.round(attemptsLimit)),
      attemptsUsed: Math.max(0, Math.round(attemptsUsed)),
      speedMult: 1,
      shield: 0,
      invisible: false,
    };

    function clampHealth(value) {
      return Math.max(0, Math.min(playerState.healthMax, value));
    }

    let downedAt = 0;
    let downedCameraActive = false;

    function resetRunState() {
      activeEffects.length = 0;
      playerState.speedMult = 1;
      playerState.shield = 0;
      playerState.invisible = false;
      finalPhase = false;
      frenzyActive = false;
      hud.setFinalTimer(0, false);
      enemyEntities.forEach((enemy) => {
        enemy.speed = enemy.baseSpeed;
      });
      inventory.fill(null);
      inventory[0] = {
        id: 'arma_basica',
        nombre: 'ARMA BASICA',
        locked: true,
        cooldownMs: 0,
        usesRemaining: null,
        lastUsedAt: -Infinity,
      };
      selectedSlot = 0;
      weapons.forEach((weapon) => {
        const ammoMax = weapon.ammoMax;
        const reserveMax = weapon.reserveMax ?? weapon.reserve;
        const ammoStart = Math.min(ammoMax, Math.max(1, Math.round(ammoMax * startMult)));
        const reserveStart = Math.max(0, Math.round(reserveMax * startMult));
        weapon.ammo = ammoStart;
        weapon.reserveAmmo = reserveStart;
        weapon.reloading = false;
        weapon.reloadUntil = 0;
        weapon.lastShotAt = -Infinity;
      });
      weaponIndex = 0;
      updateWeaponHud();
      if (itemSystem?.reset) itemSystem.reset();
      refreshHud();
    }

    function enterDownedState() {
      if (gameState !== 'playing') return;
      if (playerState.attemptsUsed >= playerState.attemptsLimit) {
        finishGame('lost');
        return;
      }
      gameState = 'downed';
      downedAt = performance.now();
      downedCameraActive = true;
      hud.setStatus('Has caido');
      setPlayerAnim('death', { once: true, force: true });
      if (downOverlay) downOverlay.classList.add('active');
      if (respawnBtn) respawnBtn.disabled = true;
      setTimeout(() => {
        if (respawnBtn) respawnBtn.disabled = false;
      }, 900);

      if (cameraEl) {
        cameraEl.setAttribute('look-controls', 'enabled: false');
        if (cameraEl.object3D) {
          cameraEl.object3D.position.set(
            playerEl.object3D.position.x + downedCamOffset.x,
            playerEl.object3D.position.y + downedCamOffset.y,
            playerEl.object3D.position.z + downedCamOffset.z,
          );
        } else {
          cameraEl.setAttribute('position', '0 6.5 0');
        }
      }
      playerEl.setAttribute('room-player', 'speed', 0);
      document.exitPointerLock?.();

      enemyEntities.forEach((enemy) => {
        if (!enemy?.el) return;
        const pos = enemy.el.object3D.position;
        const dist = Math.hypot(pos.x - playerEl.object3D.position.x, pos.z - playerEl.object3D.position.z);
        if (dist <= cellSize * 2.2) {
          enemy.anim.attackUntil = downedAt + 1200;
          setEnemyAnim(enemy, 'attack', { once: false, force: true });
        }
      });
      if (typeof hud.setEnemyFocus === 'function') {
        hud.setEnemyFocus(null);
      }
      refreshHud();
    }

    function respawnPlayer() {
      if (gameState !== 'downed') return;
      playerState.attemptsUsed += 1;
      playerState.health = playerState.healthMax;
      resetRunState();
      playerEl.setAttribute('position', `${spawn.x * cellSize} 0 ${spawn.y * cellSize}`);
      spawnSystem.clear();
      spawnSystem.spawnEnemiesFar();
      grantInvulnerability(5000);
      gameState = 'playing';
      downedCameraActive = false;
      if (downOverlay) downOverlay.classList.remove('active');
      if (cameraEl) {
        cameraEl.setAttribute('position', `${cameraFirstPos.x} ${cameraFirstPos.y} ${cameraFirstPos.z}`);
        cameraEl.setAttribute('look-controls', 'enabled: true');
      }
      hud.setStatus('Reaparecido');
      refreshHud();
    }

    function applyPlayerDamage(amount) {
      const dmg = Math.max(1, Number(amount) || 0);
      playerState.health = clampHealth(playerState.health - dmg);
      if (playerState.health <= 0) {
        enterDownedState();
      } else {
        refreshHud();
      }
    }

    const ammoProfile = ammoProfileForDifficulty(worldState.difficulty);
    const capacityMult = ammoProfile.capacity;
    const startMult = ammoProfile.start;

    const weaponModes = [
      {
        id: 'minigun',
        name: 'MINIGUN',
        damage: 0.6,
        range: cellSize * 6,
        fireMs: 120,
        bulletSpeed: cellSize * 18,
        color: '#2bd8ff',
        radius: 0.08,
        ammoMax: 120,
        reserve: 480,
        reloadMs: 900,
        chargesMax: 5,
        chargeCooldownMs: 10000,
      },
      {
        id: 'sniper',
        name: 'SNIPER',
        damage: 2.4,
        range: cellSize * 14,
        fireMs: 900,
        bulletSpeed: cellSize * 26,
        color: '#f2e9ff',
        radius: 0.1,
        ammoMax: 8,
        reserve: 32,
        reloadMs: 2400,
        penetration: true,
      },
    ];
    const weapons = weaponModes.map((mode) => {
      const ammoMax = Math.max(3, Math.round(mode.ammoMax * capacityMult));
      const reserveMax = Math.max(0, Math.round(mode.reserve * capacityMult));
      const ammoStart = Math.min(ammoMax, Math.max(1, Math.round(ammoMax * startMult)));
      const reserveStart = Math.max(0, Math.round(reserveMax * startMult));
      const chargesMax = Number.isFinite(mode.chargesMax) ? Math.max(0, Math.round(mode.chargesMax)) : 0;
      const chargeShots = chargesMax > 0 ? Math.max(4, Math.round(ammoMax / chargesMax)) : 0;
      return {
        ...mode,
        ammoMax,
        reserveMax,
        ammo: ammoStart,
        reserveAmmo: reserveStart,
        reloading: false,
        reloadUntil: 0,
        lastShotAt: -Infinity,
        chargesMax,
        charges: chargesMax,
        chargeShots,
        chargeRemaining: chargeShots,
        chargeCooldownMs: Number(mode.chargeCooldownMs) || 10000,
        chargeTimers: [],
      };
    });
    let weaponIndex = 0;

    function currentWeapon() {
      return weapons[weaponIndex];
    }

    function updateWeaponHud() {
      const weapon = currentWeapon();
      if (!weapon) return;
      hud.setWeapon(weapon.name);
      hud.setAmmo(weapon.ammo, weapon.reserveAmmo);
      if (weapon.id === 'minigun' && typeof hud.setAmmoBars === 'function') {
        hud.setAmmoBars(weapon.charges, weapon.chargesMax, null);
      } else if (typeof hud.setAmmoBars === 'function') {
        hud.setAmmoBars(0, 0, null);
      }
    }

    const startCell = worldState.meta?.start || spawn;
    const goalCell = resolveGoalCell(worldState.meta, worldState.map, worldState.width, worldState.height);
    const objectiveText = goalCell ? 'Llega al punto final' : 'Sobrevive';
    hud.setObjective(objectiveText);
    hud.setTime(0);
    if (startObjective) startObjective.textContent = objectiveText;
    const initialItems = Array.isArray(worldState.items) ? worldState.items.length : 0;

    if (typeof hud.initMinimap === 'function') {
      hud.initMinimap({
        map: worldState.map,
        width: worldState.width,
        height: worldState.height,
        start: startCell,
        end: goalCell,
        radiusCells: minimapRadius,
      });
    }

    const enemyEntities = [];

    function applyColorMask(mesh, colorHex, strength = 0.3, options = {}) {
      if (!mesh || !window.THREE || !colorHex) return;
      const mask = new THREE.Color(colorHex);
      mesh.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const cloned = mats.map((mat) => {
          if (!mat) return mat;
          return mat.userData?.__cloned ? mat : mat.clone();
        });
        cloned.forEach((mat) => {
          if (!mat || !mat.color) return;
          if (!mat.userData) mat.userData = {};
          mat.userData.__cloned = true;
          if (!mat.userData.originalColor) mat.userData.originalColor = mat.color.clone();
          mat.color.copy(mat.userData.originalColor).lerp(mask, strength);
          if ('emissive' in mat) {
            if (!mat.userData.originalEmissive) mat.userData.originalEmissive = (mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000));
            mat.emissive.copy(mat.userData.originalEmissive).lerp(mask, strength * 0.45);
            if (Number.isFinite(options.emissiveIntensity)) mat.emissiveIntensity = options.emissiveIntensity;
          }
          if (Number.isFinite(options.roughness)) mat.roughness = options.roughness;
          if (Number.isFinite(options.metalness)) mat.metalness = options.metalness;
          if (options.storeMaskedColor) {
            mat.userData.maskedColor = mat.color.clone();
            if ('emissive' in mat) mat.userData.maskedEmissive = mat.emissive ? mat.emissive.clone() : null;
          }
          mat.needsUpdate = true;
        });
        node.material = Array.isArray(node.material) ? cloned : cloned[0];
      });
    }

    function flashEnemy(enemy, flashMs = 80) {
      const mesh = enemy?.el?.getObject3D?.('mesh');
      if (!mesh || !window.THREE) return;
      const flashColor = new THREE.Color('#ff2d2d');
      mesh.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat) => {
          if (!mat || !mat.color) return;
          if (!mat.userData) mat.userData = {};
          if (!mat.userData.originalColor) mat.userData.originalColor = mat.color.clone();
          if ('emissive' in mat && !mat.userData.originalEmissive) {
            mat.userData.originalEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000);
          }
          mat.color.copy(flashColor);
          if ('emissive' in mat) {
            mat.emissive.copy(flashColor);
            mat.emissiveIntensity = 0.9;
          }
          mat.needsUpdate = true;
        });
      });
      setTimeout(() => {
        mesh.traverse((node) => {
          if (!node.isMesh || !node.material) return;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((mat) => {
            if (!mat || !mat.color || !mat.userData) return;
            if (mat.userData.maskedColor) mat.color.copy(mat.userData.maskedColor);
            else if (mat.userData.originalColor) mat.color.copy(mat.userData.originalColor);
            if ('emissive' in mat) {
              if (mat.userData.maskedEmissive) mat.emissive.copy(mat.userData.maskedEmissive);
              else if (mat.userData.originalEmissive) mat.emissive.copy(mat.userData.originalEmissive);
            }
            mat.needsUpdate = true;
          });
        });
      }, flashMs);
    }

    const difficultyCfg = difficultsData?.niveles?.[worldState.difficulty] || {};

    function spawnEnemyEntity(spawnEntry) {
      const def = entitiesData.enemies?.find((e) => e.id === spawnEntry.id);
      const stats = def?.stats || {};
      const diffEnemy = difficultyCfg?.multiplicadores?.enemigos || {};
      const statSpeed = Number(stats.velocidad);
      const baseSpeed = Number.isFinite(statSpeed)
        ? statSpeed
        : (spawnEntry.id === 'enemy_speedster' ? 1.6 : 1.1);
      const speedMult = Number(diffEnemy.velocidad) || 1;
      const scaledSpeed = baseSpeed * speedMult;
      const behavior = resolveBehavior(spawnEntry.id, spawnEntry.behavior);
      const posX = spawnEntry.x * cellSize;
      const posZ = spawnEntry.y * cellSize;

      let el;
      const baseEntityY = 0;
      const enemyAssetPath = def?.asset || ENEMY_MODEL.asset;
      if (enemyAssetPath) {
        el = document.createElement('a-entity');
        el.setAttribute('gltf-model', resolveGameUrl(enemyAssetPath));
        el.setAttribute('player-animator', 'idle: idle; walk: walk; run: run; attack: attack; death: death; jump: jump;');
        if (engineConfig.shadowsEnabled) {
          el.setAttribute('shadow', 'cast: true; receive: false');
        }
        const scale = def?.scale ?? ENEMY_MODEL.scale ?? 0.6;
        el.setAttribute('scale', `${scale} ${scale} ${scale}`);
        const yOffset = Number(def?.yOffset ?? ENEMY_MODEL.yOffset) || 0;
        el.setAttribute('position', `${posX} ${baseEntityY + yOffset} ${posZ}`);
        el.addEventListener('model-error', () => {
          el.removeAttribute('gltf-model');
          el.setAttribute('geometry', `primitive: sphere; radius: ${cellSize * 0.22}`);
          el.setAttribute('material', `color: ${def?.color || '#ff4444'}; metalness: 0.2; roughness: 0.5`);
        }, { once: true });
        el.addEventListener('model-loaded', () => {
          const mesh = el.getObject3D('mesh');
          if (!mesh || !window.THREE) return;
          const maskDef = def?.mask;
          const maskColor = typeof maskDef === 'string' ? maskDef : maskDef?.color;
          if (maskColor) {
            const strength = Number.isFinite(maskDef?.strength) ? maskDef.strength : 0.85;
            applyColorMask(mesh, maskColor, strength, {
              emissiveIntensity: Number.isFinite(maskDef?.emissiveIntensity) ? maskDef.emissiveIntensity : 0.45,
              roughness: Number.isFinite(maskDef?.roughness) ? maskDef.roughness : 0.35,
              metalness: Number.isFinite(maskDef?.metalness) ? maskDef.metalness : 0.2,
              storeMaskedColor: true,
            });
          }
          const box = new THREE.Box3().setFromObject(mesh);
          const center = box.getCenter(new THREE.Vector3());
          const targetBottom = baseEntityY + yOffset;
          el.object3D.position.x += posX - center.x;
          el.object3D.position.z += posZ - center.z;
          el.object3D.position.y += targetBottom - box.min.y;
        }, { once: true });
      } else {
        el = document.createElement('a-sphere');
        el.setAttribute('radius', cellSize * 0.2);
        el.setAttribute('color', def?.color || '#ff4444');
        el.setAttribute('position', `${posX} ${baseEntityY} ${posZ}`);
        if (engineConfig.shadowsEnabled) {
          el.setAttribute('shadow', 'cast: true; receive: false');
        }
      }
      sceneEl.appendChild(el);
      const yawOffset = Number.isFinite(def?.yawOffset) ? def.yawOffset : (ENEMY_MODEL.yawOffset || 0);
      const hitRadius = Number.isFinite(def?.hitRadius) ? def.hitRadius : (cellSize * 0.32);
      const baseHp = Number.isFinite(stats.vidas) ? stats.vidas : 1;
      const baseAttack = Number.isFinite(stats.ataque) ? stats.ataque : 1;
      const hpMult = Number(diffEnemy.vidas) || 1;
      const attackMult = Number(diffEnemy.ataque) || 1;
      const attack = baseAttack * attackMult;
      const baseHpScaled = Math.max(1, baseHp * hpMult);
      const enemyObj = {
        id: spawnEntry.id,
        el,
        speed: scaledSpeed,
        baseSpeed: scaledSpeed,
        behavior,
        turnSpeed: 6,
        yawOffset,
        hitRadius,
        attack,
        hp: baseHpScaled,
        maxHp: baseHpScaled,
        spawnedAt: performance.now(),
        anim: {
          lastPos: new THREE.Vector3(posX, baseEntityY, posZ),
          current: null,
          attackUntil: 0,
        },
      };
      if (spawnEntry.id === 'enemy_ranged') {
        enemyObj.rangedRange = cellSize * 6;
        enemyObj.rangedMinRange = cellSize * 2.5;
        enemyObj.rangedCooldownMs = 3000;
        enemyObj.rangedHitChance = 0.4;
        enemyObj.projectileColor = '#44dddd';
      }
      enemyEntities.push(enemyObj);
      return enemyObj;
    }

    worldState.enemies.forEach((enemy) => {
      spawnEnemyEntity(enemy);
    });

    const retreatOnHit = difficultyCfg?.ajustes_especiales?.retreat_on_hit === true;
    const spawnConfig = activeModeGameplay?.spawn
      ? { ...gameplayData, spawn: { ...(gameplayData?.spawn || {}), ...(activeModeGameplay.spawn || {}) } }
      : gameplayData;
    const spawnSystem = createSpawnSystem({
      map: worldState.map,
      width: worldState.width,
      height: worldState.height,
      cellSize,
      collisionSystem,
      enemyEntities,
      enemyIds,
      spawnEnemy: spawnEnemyEntity,
      getPlayerPosition: () => playerEl.object3D.position,
      getGoalCell: () => goalCell,
      worldArea,
      config: spawnConfig,
      difficulty: difficultyCfg,
    });

    let killCount = Number.isFinite(snapshotKills) ? Math.max(0, Math.round(snapshotKills)) : 0;
    let score = Number.isFinite(snapshotScore) ? Math.max(0, Math.round(snapshotScore)) : 0;
    const scoreCfg = gameplayData?.score || {};
    const scoreKillDefault = Number(scoreCfg.kill_default) || 40;
    const scoreItemDefault = Number(scoreCfg.item_pickup) || 10;
    const scoreGoalBonus = Number(scoreCfg.goal_bonus) || 250;
    const scoreMult = Number(difficultyCfg?.multiplicadores?.recompensas?.puntos_mult) || 1;
    hud.setElims(killCount);
    if (typeof hud.setScore === 'function') hud.setScore(score);

    function addScore(points, reason = '') {
      const value = Math.max(0, Math.round(Number(points) || 0));
      if (!value) return;
      score += value;
      if (typeof hud.setScore === 'function') hud.setScore(score);
      if (reason) hud.setStatus(reason);
    }

    function removeEnemy(enemy, reason = '', opts = {}) {
      if (!enemy) return;
      if (enemy._removed) return;
      enemy._removed = true;
      if (enemy?.el) enemy.el.parentNode?.removeChild(enemy.el);
      const idx = enemyEntities.indexOf(enemy);
      if (idx >= 0) enemyEntities.splice(idx, 1);
      if (!opts.silent) {
        killCount += 1;
        hud.setElims(killCount);
        const def = enemyDefById.get(enemy.id) || {};
        const points = Number(def.puntos_muerte) || scoreKillDefault;
        addScore(points * scoreMult);
      }
      if (reason) hud.setStatus(reason);
    }

    function killEnemy(enemy, reason = '') {
      if (!enemy || enemy.dead) return;
      enemy.dead = true;
      enemy.speed = 0;
      enemy.hitRadius = 0;
      const animator = enemy.el?.components?.['player-animator'];
      setEnemyAnim(enemy, 'death', { once: true, force: true });
      let durationMs = 600;
      if (animator?.getClipDuration) {
        const clipDur = animator.getClipDuration('death');
        if (Number.isFinite(clipDur) && clipDur > 0) durationMs = clipDur * 1000;
      }
      setTimeout(() => {
        removeEnemy(enemy, reason);
      }, durationMs);
    }

    const activeEffects = [];
    function addEffect(name, durationMs) {
      const now = performance.now();
      const expiresAt = now + durationMs;
      activeEffects.push({
        name,
        expiresAt,
        durationMs: Math.max(0, Number(durationMs) || 0),
        startedAt: now,
      });
    }

    const inventory = new Array(inventorySize).fill(null);
    inventory[0] = {
      id: 'arma_basica',
      nombre: 'ARMA BASICA',
      locked: true,
      cooldownMs: 0,
      usesRemaining: null,
      lastUsedAt: -Infinity,
    };
    let selectedSlot = 0;

    function buildInventoryHud(now = performance.now()) {
      return inventory.map((item) => {
        if (!item) return null;
        let cooldownRatio = 0;
        let cooldownText = '';
        if (Number(item.cooldownMs) > 0 && Number.isFinite(item.lastUsedAt) && item.lastUsedAt > 0) {
          const remaining = Math.max(0, item.cooldownMs - (now - item.lastUsedAt));
          if (remaining > 0) {
            cooldownRatio = remaining / item.cooldownMs;
            cooldownText = `${(remaining / 1000).toFixed(1)}s`;
          }
        }
        return {
          label: item.nombre || item.id,
          cooldownRatio,
          cooldownText,
        };
      });
    }

    function syncInventoryHud(now = performance.now()) {
      hud.setItems(buildInventoryHud(now), selectedSlot);
    }

    function buildEffectsHud(now = performance.now()) {
      return activeEffects
        .filter((e) => !e.name.startsWith('item:'))
        .map((effect) => {
          const remaining = Math.max(0, effect.expiresAt - now);
          const duration = Math.max(1, effect.durationMs || 1);
          const ratio = Math.max(0, Math.min(1, remaining / duration));
          return {
            name: effect.name,
            ratio,
            remainingText: remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : 'ACTIVO',
          };
        });
    }

    function refreshHud() {
      const now = performance.now();
      hud.setMode(worldState.mode);
      hud.setDifficulty(worldState.difficulty);
      if (typeof hud.setAttempts === 'function') {
        hud.setAttempts(playerState.attemptsUsed, playerState.attemptsLimit);
      }
      if (typeof hud.setHealth === 'function') {
        hud.setHealth(playerState.health, playerState.healthMax);
      }
      if (typeof hud.setSpeed === 'function') {
        const speedFactor = playerState.speedMult * (frenzyActive ? frenzySpeedMult : 1);
        hud.setSpeed(speedFactor);
      }
      syncInventoryHud(now);
      hud.setEffects(buildEffectsHud(now));
    }

    function setAnimatorsPaused(pausedState) {
      const playerAnimator = playerBodyEl?.components?.['player-animator'];
      playerAnimator?.setPaused?.(pausedState);
      enemyEntities.forEach((enemy) => {
        enemy.el?.components?.['player-animator']?.setPaused?.(pausedState);
      });
    }

    function setPlayerAnim(name, options = {}) {
      const animator = playerBodyEl?.components?.['player-animator'];
      if (!animator) return;
      const mapped = {
        idle: animator.data?.idle,
        walk: animator.data?.walk,
        attack: animator.data?.attack,
        death: animator.data?.death,
        jump: animator.data?.jump,
      };
      const clipName = mapped[name] || name;
      if (!options.force && currentPlayerAnim === name) return;
      animator.setState(clipName, options);
      currentPlayerAnim = name;
    }

    function setEnemyAnim(enemy, name, options = {}) {
      if (!enemy?.el) return;
      const animator = enemy.el.components?.['player-animator'];
      if (!animator) return;
      const mapped = {
        idle: animator.data?.idle,
        walk: animator.data?.walk,
        run: animator.data?.run,
        attack: animator.data?.attack,
        death: animator.data?.death,
        jump: animator.data?.jump,
      };
      const clipName = mapped[name] || name;
      if (!options.force && enemy.anim?.current === name) return;
      animator.setState(clipName, options);
      if (enemy.anim) enemy.anim.current = name;
    }

    function shootAttack() {
      if (gameState !== 'playing') return;
      const weapon = currentWeapon();
      if (!weapon) return;
      const now = performance.now();
      if (weapon.id === 'minigun') {
        updateWeaponCharges(now, weapon, true);
        if (weapon.charges <= 0) {
          hud.setStatus('Minigun recargando');
          return;
        }
      }
      const fireMs = weapon.fireMs * (frenzyActive ? frenzyCooldownMult : 1);
      if (now - weapon.lastShotAt < fireMs) return;
      if (weapon.reloading) return;
      if (weapon.ammo <= 0) {
        if (weapon.reserveAmmo > 0) startReload(weapon);
        else hud.setStatus('Sin municion');
        return;
      }
      weapon.lastShotAt = now;
      weapon.ammo -= 1;
      updateWeaponHud();
      if (weapon.ammo <= 0 && weapon.reserveAmmo > 0) startReload(weapon);
      const attackDuration = Math.max(120, fireMs);
      attackUntil = now + attackDuration;
      setPlayerAnim('attack', { once: true, force: true });
      performShot(weapon);
      playShot();

      if (weapon.id === 'minigun' && weapon.chargesMax > 0) {
        weapon.chargeRemaining = Math.max(0, weapon.chargeRemaining - 1);
        if (weapon.chargeRemaining <= 0) {
          weapon.charges = Math.max(0, weapon.charges - 1);
          weapon.chargeTimers.push(now + weapon.chargeCooldownMs);
          if (weapon.charges > 0) {
            weapon.chargeRemaining = weapon.chargeShots;
          }
        }
        updateWeaponCharges(now, weapon);
      }
    }

    function performShot(weapon) {
      const camRef = cameraEl || playerEl.querySelector('[camera]');
      const camObj = camRef?.object3D;
      if (!camObj || !window.THREE) return;
      camObj.getWorldPosition(bulletOrigin);
      camObj.getWorldDirection(bulletDir);
      if (bulletDir.lengthSq() === 0) return;
      bulletDir.normalize().multiplyScalar(-1);
      rayDirXZ.set(bulletDir.x, 0, bulletDir.z);
      if (rayDirXZ.lengthSq() === 0) return;
      rayDirXZ.normalize();

      const range = Math.max(0.5, weapon.range || cellSize * 6);
      const wallHit = findWallHit(bulletOrigin, bulletDir, range);
      const wallDistance = wallHit ? wallHit.distance : range;

      if (weapon.penetration) {
        const hits = findEnemyHits(bulletOrigin, rayDirXZ, wallDistance);
        spawnTracer(bulletOrigin, bulletDir, wallDistance, weapon);
        hits.forEach((hit) => {
          spawnImpact(hit.enemy.el.object3D.position, '#ff2d2d');
          applyDamage(hit.enemy, weapon.damage, weapon);
        });
        if (wallHit) spawnImpact(wallHit.position);
        return;
      }

      const enemyHit = findEnemyHit(bulletOrigin, rayDirXZ, wallDistance);

      let hitDistance = wallDistance;
      let hitPosition = rayPos.copy(bulletOrigin).addScaledVector(bulletDir, hitDistance);
      if (enemyHit && enemyHit.distance < hitDistance) {
        hitDistance = enemyHit.distance;
        hitPosition = enemyHit.position;
      }

      spawnTracer(bulletOrigin, bulletDir, hitDistance, weapon);

      if (enemyHit && enemyHit.distance <= hitDistance + 0.001) {
        spawnImpact(enemyHit.enemy.el.object3D.position, '#ff2d2d');
        applyDamage(enemyHit.enemy, weapon.damage, weapon);
      } else if (wallHit) {
        spawnImpact(hitPosition);
      }
    }

    function updatePlayerAnim(dt) {
      if (gameState !== 'playing') return;
      const pos = playerEl.object3D.position;
      const dx = pos.x - lastPlayerPos.x;
      const dz = pos.z - lastPlayerPos.z;
      lastPlayerPos.copy(pos);

      const speed = Math.hypot(dx, dz) / Math.max(0.016, dt);
      currentMoveSpeed = speed;
      const now = performance.now();
      const playerComp = playerEl.components?.['room-player'];
      const grounded = playerComp?.grounded ?? true;
      if (!grounded) {
        setPlayerAnim('jump', { once: false });
        return;
      }
      if (now < attackUntil) {
        setPlayerAnim('attack', { once: true });
        return;
      }
      const moving = speed > 0.35;
      setPlayerAnim(moving ? 'walk' : 'idle');
    }

    function applyItemEffect(item) {
      const effects = item.efectos || {};
      if (item.id === 'ammo_light' || item.id === 'ammo_heavy') {
        const targetId = item.id === 'ammo_light' ? 'minigun' : 'sniper';
        const weapon = weapons.find((w) => w.id === targetId);
        if (weapon) {
          const totalMax = (weapon.ammoMax || 0) + (weapon.reserveMax || 0);
          const currentTotal = (weapon.ammo || 0) + (weapon.reserveAmmo || 0);
          const missing = Math.max(0, totalMax - currentTotal);
          const give = Math.max(1, Math.ceil(missing * 0.1));
          const ammoMissing = Math.max(0, (weapon.ammoMax || 0) - (weapon.ammo || 0));
          const toAmmo = Math.min(give, ammoMissing);
          weapon.ammo = Math.min(weapon.ammoMax, weapon.ammo + toAmmo);
          const remaining = Math.max(0, give - toAmmo);
          const reserveCap = Number.isFinite(weapon.reserveMax) ? weapon.reserveMax : Infinity;
          weapon.reserveAmmo = Math.min(reserveCap, weapon.reserveAmmo + remaining);
          if (currentWeapon()?.id === weapon.id) updateWeaponHud();
        }
        return;
      }
      if (item.id === 'speed_boost') {
        playerState.speedMult = effects.velocidad_multiplicador || 1.4;
        addEffect('Velocidad', effects.duracion_ms || 6000);
        addEffect('item:speed_boost', effects.duracion_ms || 6000);
      }
      if (item.id === 'invisibility') {
        playerState.invisible = true;
        addEffect('Invisible', effects.duracion_ms || 7000);
        addEffect('item:invisibility', effects.duracion_ms || 7000);
      }
      if (item.id === 'extra_life') {
        const extra = effects.vidas || 1;
        playerState.attemptsLimit = Math.max(1, playerState.attemptsLimit + Math.round(extra));
        addEffect('Intento+', effects.duracion_ms || 2500);
      }
      if (item.id === 'slow') {
        const slowMult = effects.velocidad_multiplicador || 0.6;
        enemyEntities.forEach((e) => { e.speed = e.baseSpeed * slowMult; });
        addEffect('Lento', effects.duracion_ms || 5000);
        addEffect('item:slow', effects.duracion_ms || 5000);
      }
      if (item.id === 'freeze') {
        enemyEntities.forEach((e) => { e.speed = 0; });
        addEffect('Congelar', effects.duracion_ms || 5000);
        addEffect('item:freeze', effects.duracion_ms || 5000);
      }
      if (item.id === 'shield') {
        playerState.shield += effects.golpes_absorbidos || 1;
        addEffect('Escudo', effects.duracion_ms || 12000);
        addEffect('item:shield', effects.duracion_ms || 12000);
      }
      if (item.id === 'power_pellet') {
        enemyEntities.forEach((e) => { e.speed = e.baseSpeed * 0.2; });
        addEffect('Caza', effects.duracion_ms || 8000);
        addEffect('item:power_pellet', effects.duracion_ms || 8000);
      }
      if (item.id === 'bomb') {
        const radius = Number(effects.radio_explosion) || (cellSize * 2);
        const pos = playerEl.object3D.position;
        const currentEnemies = enemyEntities.slice();
        currentEnemies.forEach((enemy) => {
          const epos = enemy.el.object3D.position;
          const dist = Math.hypot(epos.x - pos.x, epos.z - pos.z);
          if (dist <= radius) {
          killEnemy(enemy, 'Explosion');
          }
        });
        addEffect('Explosion', 1200);
      }
      if (item.id === 'extra_points') {
        addEffect('Puntos +', 2500);
      }
      if (item.id === 'map_enemies') {
        addEffect('Radar Enemigos', effects.duracion_ms || 10000);
      }
      if (item.id === 'map_boosts') {
        addEffect('Radar Items', effects.duracion_ms || 12000);
      }
      refreshHud();
    }

    const itemSystem = createItemSystem({
      sceneEl,
      itemsData,
      worldState,
      cellSize,
      shadowEnabled: engineConfig.shadowsEnabled,
      onPickup: (item) => {
        hud.setStatus(`Item obtenido: ${item.nombre || item.id}`);
        if (item?.id !== 'ammo_light' && item?.id !== 'ammo_heavy') {
          addScore(scoreItemDefault * scoreMult);
        }
      },
    });

    syncInventoryHud();

    function addToInventory(def) {
      if (def?.id === 'ammo_light' || def?.id === 'ammo_heavy') {
        applyItemEffect(def);
        hud.setStatus(def?.id === 'ammo_light' ? 'Munición ligera' : 'Munición pesada');
        return true;
      }
      const slot = inventory.findIndex((item, idx) => idx > 0 && !item);
      if (slot === -1) {
        hud.setStatus('Inventario lleno');
        return false;
      }
      const uses = def.usos;
      const usesRemaining = Number.isFinite(uses) ? Math.max(1, Math.round(uses)) : null;
      inventory[slot] = {
        id: def.id,
        nombre: def.nombre || def.id,
        def,
        cooldownMs: Number(def.cooldown_ms) || 0,
        usesRemaining,
        lastUsedAt: -Infinity,
        esInstantaneo: def.es_instantaneo !== false,
      };
      syncInventoryHud();
      hud.setStatus(`Slot ${slot + 1}: ${inventory[slot].nombre}`);
      return true;
    }

    function startReload(weapon) {
      if (!weapon || weapon.reloading || weapon.reserveAmmo <= 0) return;
      if (weapon.ammo >= weapon.ammoMax) return;
      weapon.reloading = true;
      weapon.reloadUntil = performance.now() + weapon.reloadMs;
      hud.setStatus(`Recargando ${weapon.name}`);
    }

    function updateWeaponCharges(now, weapon = null, onlyTick = false) {
      const target = weapon || currentWeapon();
      if (!target || target.id !== 'minigun' || target.chargesMax <= 0) return;
      if (!Array.isArray(target.chargeTimers)) target.chargeTimers = [];
      let progress = null;
      if (target.chargeTimers.length) {
        const remaining = [];
        for (const t of target.chargeTimers) {
          if (now >= t) {
            target.charges = Math.min(target.chargesMax, target.charges + 1);
          } else {
            remaining.push(t);
          }
        }
        target.chargeTimers = remaining;
        if (remaining.length) {
          const next = Math.min(...remaining);
          const total = target.chargeCooldownMs || 10000;
          progress = 1 - Math.max(0, Math.min(1, (next - now) / total));
        }
      }
      if (target.charges > 0 && target.chargeRemaining <= 0) {
        target.chargeRemaining = target.chargeShots;
      }
      if (!onlyTick && typeof hud.setAmmoBars === 'function') {
        hud.setAmmoBars(target.charges, target.chargesMax, progress);
      } else if (typeof hud.setAmmoBars === 'function') {
        hud.setAmmoBars(target.charges, target.chargesMax, progress);
      }
    }

    function applyDamage(enemy, damage, weapon = null) {
      if (!enemy) return;
      let finalDamage = Math.max(1, Number(damage) || 1);

      if (weapon?.id === 'sniper') {
        const diffKey = String(worldState.difficulty || 'normal').toLowerCase();
        const profile = {
          facil: { crit: 0.65, shots: 1 },
          normal: { crit: 0.5, shots: 1 },
          dificil: { crit: 0.35, shots: 2 },
          experto: { crit: 0.25, shots: 2 },
          pesadilla: { crit: 0.2, shots: 2 },
        }[diffKey] || { crit: 0.4, shots: 2 };

        const isTank = enemy.id === 'enemy_tank';
        const crit = !isTank && Math.random() < profile.crit;
        if (isTank) {
          finalDamage = Math.max(1, enemy.maxHp / 2);
        } else if (crit || profile.shots <= 1) {
          finalDamage = Math.max(1, enemy.maxHp);
          hud.setStatus('CRITICO!');
        } else {
          finalDamage = Math.max(1, enemy.maxHp / Math.max(1, profile.shots));
        }
      }

      enemy.hp = Number(enemy.hp) - finalDamage;
      flashEnemy(enemy, 90);
      if (enemy.hp <= 0) {
        killEnemy(enemy, 'Enemigo eliminado');
      }
    }

    function spawnImpact(position, color = '#ff6b6b') {
      if (!sceneEl || !position) return;
      const impact = document.createElement('a-entity');
      impact.setAttribute('geometry', 'primitive: sphere; radius: 0.16');
      impact.setAttribute('material', `color: ${color}; emissive: ${color}; emissiveIntensity: 0.9; metalness: 0.1; roughness: 0.2`);
      impact.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
      sceneEl.appendChild(impact);
      setTimeout(() => {
        impact.parentNode?.removeChild(impact);
      }, 120);
    }

    const bulletDir = new THREE.Vector3();
    const bulletOrigin = new THREE.Vector3();
    const rayPos = new THREE.Vector3();
    const rayTmp = new THREE.Vector3();
    const rayDirXZ = new THREE.Vector3();
    const traceUp = new THREE.Vector3(0, 1, 0);
    const traceQuat = new THREE.Quaternion();
    const traceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const enemyVec = new THREE.Vector3();
    const enemyAimVec = new THREE.Vector3();
    const enemyShotOrigin = new THREE.Vector3();
    const enemyShotTarget = new THREE.Vector3();
    const enemyShotDir = new THREE.Vector3();

    function spawnTracer(origin, dir, length, weapon) {
      if (!sceneEl || !weapon) return;
      const tracer = document.createElement('a-entity');
      const radius = Math.max(0.02, (weapon.radius || 0.08) * 0.5);
      const height = Math.max(0.2, length);
      tracer.setAttribute('geometry', `primitive: cylinder; radius: ${radius}; height: ${height}`);
      tracer.setAttribute(
        'material',
        `color: ${weapon.color}; emissive: ${weapon.color}; emissiveIntensity: 0.9; opacity: 0.85; transparent: true`,
      );
      const mid = rayPos.copy(origin).addScaledVector(dir, height * 0.5);
      tracer.setAttribute('position', `${mid.x} ${mid.y} ${mid.z}`);
      traceQuat.setFromUnitVectors(traceUp, dir);
      traceEuler.setFromQuaternion(traceQuat, 'YXZ');
      const deg = THREE.MathUtils.radToDeg;
      tracer.setAttribute('rotation', `${deg(traceEuler.x)} ${deg(traceEuler.y)} ${deg(traceEuler.z)}`);
      sceneEl.appendChild(tracer);
      setTimeout(() => {
        tracer.parentNode?.removeChild(tracer);
      }, 80);
    }

    function spawnEnemyTracer(origin, dir, length, color = '#44dddd') {
      if (!sceneEl) return;
      const tracer = document.createElement('a-entity');
      const radius = 0.04;
      const height = Math.max(0.2, length);
      tracer.setAttribute('geometry', `primitive: cylinder; radius: ${radius}; height: ${height}`);
      tracer.setAttribute(
        'material',
        `color: ${color}; emissive: ${color}; emissiveIntensity: 0.9; opacity: 0.85; transparent: true`,
      );
      const mid = rayPos.copy(origin).addScaledVector(dir, height * 0.5);
      tracer.setAttribute('position', `${mid.x} ${mid.y} ${mid.z}`);
      traceQuat.setFromUnitVectors(traceUp, dir);
      traceEuler.setFromQuaternion(traceQuat, 'YXZ');
      const deg = THREE.MathUtils.radToDeg;
      tracer.setAttribute('rotation', `${deg(traceEuler.x)} ${deg(traceEuler.y)} ${deg(traceEuler.z)}`);
      sceneEl.appendChild(tracer);
      setTimeout(() => {
        tracer.parentNode?.removeChild(tracer);
      }, 120);
    }

    function findWallHit(origin, dir, range) {
      if (!collisionSystem?.collidesAt) return null;
      const step = Math.max(0.4, cellSize * 0.2);
      const steps = Math.ceil(range / step);
      for (let i = 0; i <= steps; i += 1) {
        const dist = i * step;
        if (dist > range) break;
        rayTmp.copy(origin).addScaledVector(dir, dist);
        if (collisionSystem.collidesAt(rayTmp.x, rayTmp.y, rayTmp.z, 0.12, 0.4)) {
          return { distance: dist, position: rayTmp.clone() };
        }
      }
      return null;
    }

    function findEnemyHit(origin, dir, range) {
      let best = null;
      let bestDist = Infinity;
      for (const enemy of enemyEntities) {
        if (!enemy?.el || enemy.dead || enemy._removed) continue;
        const epos = enemy.el.object3D.position;
        enemyVec.set(epos.x - origin.x, 0, epos.z - origin.z);
        const t = enemyVec.dot(dir);
        if (t <= 0 || t > range) continue;
        rayTmp.copy(origin).addScaledVector(dir, t);
        const dx = epos.x - rayTmp.x;
        const dz = epos.z - rayTmp.z;
        const dist = Math.hypot(dx, dz);
        const hitRadius = enemy.hitRadius || cellSize * 0.3;
        if (dist <= hitRadius && t < bestDist) {
          bestDist = t;
          best = {
            enemy,
            distance: t,
            position: new THREE.Vector3(rayTmp.x, epos.y, rayTmp.z),
          };
        }
      }
      return best;
    }

    function findEnemyHits(origin, dir, range) {
      const hits = [];
      for (const enemy of enemyEntities) {
        if (!enemy?.el || enemy.dead || enemy._removed) continue;
        const epos = enemy.el.object3D.position;
        enemyVec.set(epos.x - origin.x, 0, epos.z - origin.z);
        const t = enemyVec.dot(dir);
        if (t <= 0 || t > range) continue;
        rayTmp.copy(origin).addScaledVector(dir, t);
        const dx = epos.x - rayTmp.x;
        const dz = epos.z - rayTmp.z;
        const dist = Math.hypot(dx, dz);
        const hitRadius = enemy.hitRadius || cellSize * 0.3;
        if (dist <= hitRadius) {
          hits.push({ enemy, distance: t });
        }
      }
      hits.sort((a, b) => a.distance - b.distance);
      return hits;
    }

    updateWeaponHud();
    function consumeSlot(slotIdx) {
      if (slotIdx <= 0 || slotIdx >= inventory.length) return;
      inventory[slotIdx] = null;
      if (selectedSlot === slotIdx) selectedSlot = 0;
      syncInventoryHud();
    }

    function useSlot(slotIdx) {
      const item = inventory[slotIdx];
      if (!item || item.locked) return false;
      const now = performance.now();
      const cooldown = item.cooldownMs * (frenzyActive ? frenzyCooldownMult : 1);
      if (cooldown > 0 && now - item.lastUsedAt < cooldown) {
        hud.setStatus('Item en cooldown');
        return false;
      }
      item.lastUsedAt = now;
      applyItemEffect(item.def || item);
      if (Number.isFinite(item.usesRemaining)) {
        item.usesRemaining -= 1;
        if (item.usesRemaining <= 0) {
          consumeSlot(slotIdx);
        }
      } else if (item.esInstantaneo) {
        consumeSlot(slotIdx);
      }
      syncInventoryHud();
      return true;
    }

    const culling = createCullingSystem({
      cameraEl: cameraEl || sceneEl.querySelector('[camera]'),
      maxDistance: Math.max(24, (engineConfig.cullingDistance || 60) * lodFactor),
    });
    const cullingEnabled = engineConfig.cullingEnabled !== false;
    const cullIntervalMs = lodMode === 'aggressive' ? 450 : lodMode === 'quality' ? 200 : 300;
    let lastCullUpdate = 0;
    const staticWalls = Array.isArray(walls) ? walls : [];

    const camDir = new THREE.Vector3();
    const camQuat = new THREE.Quaternion();
    const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const focusDir = new THREE.Vector3();
    const focusVec = new THREE.Vector3();
    const enemyFocusDir = new THREE.Vector3();
    const enemyFocusVec = new THREE.Vector3();
    const enemyFocusOrigin = new THREE.Vector3();
    const downedCamOffset = new THREE.Vector3(0, 6.5, 0);
    let focusedItemId = null;
    let focusedEnemyId = null;

    function hashId(id) {
      let h = 0;
      const str = String(id || '');
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }

    function updateMinimap() {
      if (typeof hud.updateMinimap !== 'function') return;
      const playerCell = worldToCell(playerEl.object3D.position, cellSize);
      const now = performance.now();

      const visibleRadius = Math.max(minimapRadius, playerDetectionCells);
      const itemCells = itemSystem.getRemaining().filter((item) => {
        const dx = item.x - playerCell.x;
        const dy = item.y - playerCell.y;
        return Math.hypot(dx, dy) <= visibleRadius;
      }).map((item) => ({ x: item.x, y: item.y }));

      const enemyCells = [];
      enemyEntities.forEach((enemy) => {
        if (enemy?.dead || enemy?._removed) return;
        if (!enemy?.el) return;
        const cell = worldToCell(enemy.el.object3D.position, cellSize);
        const def = enemyDefById.get(enemy.id);
        const stats = def?.stats || {};
        const detection = Number(stats.deteccion) || 100;
        const detectCells = Math.max(visibleRadius, Math.max(3, Math.min(14, Math.round(detection / 20))));
        const dx = cell.x - playerCell.x;
        const dy = cell.y - playerCell.y;
        const dist = Math.hypot(dx, dy);
        if (dist > detectCells) return;
        const sigilo = Number(stats.sigilo) || 0;
        if (sigilo > 1) {
          const interval = 450 + sigilo * 350;
          const window = interval * 0.35;
          const offset = hashId(enemy.id) % interval;
          if (((now + offset) % interval) > window) return;
        }
        enemyCells.push(cell);
      });
      let rotation = 0;
      const camRef = cameraEl || playerEl.querySelector('[camera]');
      const camObj = camRef?.object3D;
      const lookControls = camRef?.components?.['look-controls'];
      if (camObj?.getWorldDirection) {
        camObj.getWorldDirection(camDir);
        rotation = Math.atan2(-camDir.x, camDir.z);
      } else if (lookControls?.yawObject?.rotation) {
        rotation = -lookControls.yawObject.rotation.y;
      } else if (camObj?.getWorldQuaternion) {
        camObj.getWorldQuaternion(camQuat);
        camEuler.setFromQuaternion(camQuat);
        rotation = -camEuler.y;
      }
      hud.updateMinimap({
        player: playerCell,
        enemies: enemyCells,
        items: itemCells,
        goal: goalCell,
        rotation,
      });
    }

    function updateItemFocus() {
      if (typeof hud.setItemFocus !== 'function') return;
      const camRef = cameraEl || playerEl.querySelector('[camera]');
      if (!camRef?.object3D?.getWorldDirection) return;
      camRef.object3D.getWorldDirection(focusDir);
      focusDir.multiplyScalar(-1);
      focusDir.y = 0;
      if (focusDir.lengthSq() === 0) return;
      focusDir.normalize();

      const playerPos = playerEl.object3D.position;
      const maxDist = cellSize * 1.4;
      const minDot = Math.cos(Math.PI * 0.35);
      let best = null;
      let bestScore = -Infinity;

      for (const item of itemSystem.items) {
        if (!item || item.picked) continue;
        const pos = item.el?.object3D?.position;
        if (!pos) continue;
        focusVec.set(pos.x - playerPos.x, 0, pos.z - playerPos.z);
        const dist = focusVec.length();
        if (dist <= 0.0001 || dist > maxDist) continue;
        focusVec.divideScalar(dist);
        const dot = focusVec.dot(focusDir);
        if (dot < minDot) continue;
        const score = dot * 2 - dist / maxDist;
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }

      if (best) {
        if (focusedItemId !== best.def.id) {
          focusedItemId = best.def.id;
          hud.setItemFocus(best.def.nombre || best.def.id, best.def.descripcion || 'Sin descripcion');
        }
      } else if (focusedItemId) {
        focusedItemId = null;
        hud.setItemFocus('-', 'Apunta a un item para ver detalles.');
      }
    }

    function updateEnemyFocus() {
      if (typeof hud.setEnemyFocus !== 'function') return;
      if (gameState !== 'playing') {
        if (focusedEnemyId) {
          focusedEnemyId = null;
          hud.setEnemyFocus(null);
        }
        return;
      }
      const camRef = cameraEl || playerEl.querySelector('[camera]');
      if (!camRef?.object3D?.getWorldDirection) return;
      camRef.object3D.getWorldDirection(enemyFocusDir);
      enemyFocusDir.multiplyScalar(-1);
      enemyFocusDir.y = 0;
      if (enemyFocusDir.lengthSq() === 0) return;
      enemyFocusDir.normalize();

      const playerPos = playerEl.object3D.position;
      enemyFocusOrigin.set(playerPos.x, 0.35, playerPos.z);
      const maxDist = cellSize * 7;
      const minDot = Math.cos(Math.PI * 0.3);
      let best = null;
      let bestScore = -Infinity;

      for (const enemy of enemyEntities) {
        if (!enemy?.el || enemy.dead || enemy._removed) continue;
        const pos = enemy.el.object3D.position;
        enemyFocusVec.set(pos.x - playerPos.x, 0, pos.z - playerPos.z);
        const dist = enemyFocusVec.length();
        if (dist <= 0.0001 || dist > maxDist) continue;
        enemyFocusVec.divideScalar(dist);
        const dot = enemyFocusVec.dot(enemyFocusDir);
        if (dot < minDot) continue;
        if (collisionSystem?.collidesAt) {
          const wallHit = findWallHit(enemyFocusOrigin, enemyFocusVec, Math.max(0.1, dist - cellSize * 0.25));
          if (wallHit) continue;
        }
        const score = dot * 2 - dist / maxDist;
        if (score > bestScore) {
          bestScore = score;
          best = enemy;
        }
      }

      if (best) {
        if (focusedEnemyId !== best.id) focusedEnemyId = best.id;
        const def = enemyDefById.get(best.id) || {};
        const stats = def.stats || {};
        const attack = Number(stats.ataque ?? best.attack) || 1;
        const speed = Number(stats.velocidad ?? best.baseSpeed ?? best.speed) || 1;
        const sigilo = Number(stats.sigilo) || 0;
        const statsText = `ATQ ${attack.toFixed(1)}  SPD ${speed.toFixed(2)}  SIG ${sigilo.toFixed(1)}`;
        hud.setEnemyFocus({
          id: best.id,
          name: def.nombre || best.id,
          hp: best.hp,
          maxHp: best.maxHp,
          stats: statsText,
        });
      } else if (focusedEnemyId) {
        focusedEnemyId = null;
        hud.setEnemyFocus(null);
      }
    }

    function renderResultStats() {
      if (!resultStats) return;
      const remainingItems = itemSystem.getRemaining().length;
      const collectedItems = Math.max(0, initialItems - remainingItems);
      const lines = [
        { label: 'Puntaje', value: `${score}` },
        { label: 'Tiempo', value: formatDuration(elapsedMs) },
        { label: 'Items', value: `${collectedItems}/${initialItems}` },
        { label: 'Eliminaciones', value: `${killCount}` },
        { label: 'Mapa', value: `${worldState.width}x${worldState.height}` },
        { label: 'Altura', value: `${wallHeight}` },
        { label: 'Modo', value: worldState.mode || '-' },
        { label: 'Dificultad', value: worldState.difficulty || '-' },
      ];
      if (worldState.meta?.seed != null) {
        lines.push({ label: 'Seed', value: String(worldState.meta.seed) });
      }
      if (worldState.meta?.seedSource) {
        lines.push({ label: 'Seed src', value: String(worldState.meta.seedSource) });
      }

      resultStats.innerHTML = '';
      lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'overlay-row';
        const label = document.createElement('span');
        label.textContent = line.label;
        const value = document.createElement('span');
        value.textContent = line.value;
        row.appendChild(label);
        row.appendChild(value);
        resultStats.appendChild(row);
      });
    }

    let gameState = 'ready';
    let paused = false;
    let elapsedMs = 0;
    let lastHudUpdate = 0;
    let lastMinimapUpdate = 0;
    let lastEnemyFocusUpdate = 0;
    let invulnerableUntil = 0;
    let lastAutoSaveAt = 0;
    let finalPhase = false;
    let finalEndsAt = 0;
    let lastEnemySpawnAt = 0;
    let frenzyActive = false;
    let firing = false;

    function setEffect(name, durationMs) {
      const now = performance.now();
      const expiresAt = now + durationMs;
      const idx = activeEffects.findIndex((e) => e.name === name);
      if (idx >= 0) activeEffects.splice(idx, 1);
      activeEffects.push({
        name,
        expiresAt,
        durationMs: Math.max(0, Number(durationMs) || 0),
        startedAt: now,
      });
    }

    function grantInvulnerability(durationMs = engineConfig.invulnMs) {
      invulnerableUntil = performance.now() + durationMs;
      setEffect('Invulnerable', durationMs);
      refreshHud();
    }

    function startFinalPhase() {
      if (finalPhase) return;
      finalPhase = true;
      frenzyActive = true;
      finalEndsAt = performance.now() + finalDurationMs;
      setEffect('Frenesi', finalDurationMs);
      hud.setStatus('FRENESI ACTIVADO');
      refreshHud();
    }

    function spawnEnemyWave(count = 1) {
      const avoid = new Set();
      const playerCell = worldToCell(playerEl.object3D.position, cellSize);
      avoid.add(`${playerCell.x},${playerCell.y}`);
      if (goalCell) avoid.add(`${goalCell.x},${goalCell.y}`);
      const pts = generateSpawnPoints(worldState.map, worldState.width, worldState.height, count, { avoid });
      pts.forEach((pt, idx) => {
        const id = enemyIds[idx % enemyIds.length];
        const entry = { id, x: pt.x, y: pt.y };
        worldState.enemies.push(entry);
        spawnEnemyEntity(entry);
      });
    }

    function beginGame() {
      if (gameState !== 'ready') return;
      gameState = 'playing';
      paused = false;
      if (startOverlay) startOverlay.classList.remove('active');
      hud.setStatus('Esc para pausar');
      grantInvulnerability(5000);
      startAudio();
      if (sceneEl?.canvas?.requestPointerLock) {
        sceneEl.canvas.requestPointerLock();
      }
      if (sceneEl?.isPlaying === false) sceneEl.play();
      setAnimatorsPaused(false);
      updateMinimap();
    }

    function finishGame(outcome) {
      if (gameState !== 'playing') return;
      gameState = outcome === 'won' ? 'won' : 'lost';
      paused = true;
      stopAudio();
      sceneEl?.pause?.();
      finalPhase = false;
      frenzyActive = false;
      hud.setFinalTimer(0, false);
      if (pauseOverlay) pauseOverlay.classList.remove('active');
      if (resultOverlay) resultOverlay.classList.add('active');
      if (outcome === 'won') {
        addScore(scoreGoalBonus * scoreMult);
        markLevelCompleted(worldState?.meta?.name || worldId);
      }

      const title = outcome === 'won' ? 'Victoria' : 'Derrota';
      const msg = outcome === 'won'
        ? `Objetivo completado - Tiempo: ${formatDuration(elapsedMs)}`
        : `Se acabaron los intentos - Tiempo: ${formatDuration(elapsedMs)}`;

      if (resultTitle) resultTitle.textContent = title;
      if (resultMessage) resultMessage.textContent = msg;
      renderResultStats();
      hud.setTime(elapsedMs);
      hud.setStatus(title);
      if (outcome !== 'won') {
        setAnimatorsPaused(false);
        setPlayerAnim('death', { once: true, force: true });
        const animator = playerBodyEl?.components?.['player-animator'];
        let freezeMs = 650;
        if (animator?.getClipDuration) {
          const clip = animator.getClipDuration('death');
          if (Number.isFinite(clip) && clip > 0) {
            freezeMs = Math.max(250, clip * 1000);
          }
        }
        setTimeout(() => setAnimatorsPaused(true), freezeMs);
      } else {
        setAnimatorsPaused(true);
      }
    }

    function handlePlayerHit(enemy, options = {}) {
      const now = performance.now();
      if (enemy && retreatOnHit && !options.skipRetreat) {
        if (!enemy.ai) enemy.ai = {};
        const epos = enemy.el?.object3D?.position;
        const ppos = playerEl.object3D.position;
        if (epos && ppos) {
          const dx = epos.x - ppos.x;
          const dz = epos.z - ppos.z;
          const len = Math.hypot(dx, dz) || 1;
          enemy.ai.retreatDir = { x: dx / len, z: dz / len };
        } else {
          enemy.ai.retreatDir = null;
        }
        enemy.ai.retreatUntil = now + 900;
      }
      if (activeEffects.find((e) => e.name === 'Caza')) {
        killEnemy(enemy, 'Enemigo eliminado');
        return;
      }
      if (playerState.invisible) {
        hud.setStatus('Invisible');
        return;
      }
      if (enemy?.anim) {
        enemy.anim.attackUntil = now + 420;
        setEnemyAnim(enemy, 'attack', { once: true, force: true });
      }
      if (now < invulnerableUntil) {
        hud.setStatus('Invulnerable');
        return;
      }
      if (playerState.shield > 0) {
        playerState.shield -= 1;
        hud.setStatus('Escudo absorbio el golpe');
        refreshHud();
        return;
      }
      const attack = Number(enemy?.attack) || 1;
      const defense = Number(playerStats?.defensa) || 0;
      const baseDamage = attack * 12;
      const mitigated = baseDamage / (1 + defense * 0.4);
      const damage = Math.max(4, mitigated);
      hud.setStatus('Te golpearon');
      applyPlayerDamage(damage);
    }

    function faceEnemyToPlayer(enemy) {
      const enemyPos = enemy?.el?.object3D?.position;
      const playerPos = playerEl?.object3D?.position;
      if (!enemyPos || !playerPos) return;
      const dx = playerPos.x - enemyPos.x;
      const dz = playerPos.z - enemyPos.z;
      if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
      const yaw = Math.atan2(dx, dz) + (enemy?.yawOffset || 0);
      enemy.el.object3D.rotation.set(0, yaw, 0);
    }

    function fireEnemyProjectile(enemy) {
      if (!enemy?.el || !collisionSystem?.collidesAt) return;
      const isShootEnemy = enemy.id === 'enemy_ranged';
      const now = performance.now();
      let timeToFireMs = 0;
      if (isShootEnemy) {
        faceEnemyToPlayer(enemy);
        const animator = enemy.el.components?.['player-animator'];
        const clipDuration = animator?.getClipDuration?.('attack');
        if (Number.isFinite(clipDuration) && clipDuration > 0) {
          timeToFireMs = (clipDuration * 6 / 20) * 1000;
          enemy.anim.attackUntil = now + clipDuration * 1000;
          setEnemyAnim(enemy, 'attack', { once: true, force: true });
        }
      }

      const hitChance = isShootEnemy ? (enemy.rangedHitChance ?? 0.4) : 1;
      const willHit = Math.random() <= hitChance;

      const executeShot = () => {
        const origin = enemy.el.object3D.position;
        enemyShotOrigin.copy(origin);
        enemyShotOrigin.y += 1.2;
        enemyShotTarget.copy(playerEl.object3D.position);
        enemyShotTarget.y += 1.2;
        enemyShotDir.copy(enemyShotTarget).sub(enemyShotOrigin);
        let dist = enemyShotDir.length();
        if (dist <= 0.1) return;
        enemyShotDir.normalize();

        if (!willHit) {
          const missOffset = 0.8 + Math.random() * 1.4;
          enemyAimVec.set(enemyShotDir.z, 0, -enemyShotDir.x).normalize();
          enemyShotTarget.addScaledVector(enemyAimVec, missOffset);
          enemyShotDir.copy(enemyShotTarget).sub(enemyShotOrigin);
          dist = enemyShotDir.length();
          if (dist <= 0.1) return;
          enemyShotDir.normalize();
        }

        const wallHit = findWallHit(enemyShotOrigin, enemyShotDir, dist);
        const hitDist = wallHit ? wallHit.distance : dist;
        spawnEnemyTracer(enemyShotOrigin, enemyShotDir, hitDist, enemy.projectileColor);
        if (wallHit) return;
        if (willHit) {
          handlePlayerHit(enemy, { skipRetreat: true });
        }
      };

      if (timeToFireMs > 0) {
        setTimeout(executeShot, timeToFireMs);
      } else {
        executeShot();
      }
    }

    const aiSystem = createAISystem({
      map: worldState.map,
      width: worldState.width,
      height: worldState.height,
      cellSize,
      enemies: enemyEntities,
      getPlayerPosition: () => playerEl.object3D.position,
      onPlayerHit: (enemy) => handlePlayerHit(enemy),
      onRangedAttack: (enemy) => fireEnemyProjectile(enemy),
    });

    combatSystem = createCombatSystem({
      playerEl,
      cameraEl,
      enemies: enemyEntities,
      cellSize,
      onKill: (enemy) => killEnemy(enemy, 'Enemigo eliminado'),
    });

    function togglePause(force) {
      if (gameState !== 'playing') return;
      paused = typeof force === 'boolean' ? force : !paused;
      if (pauseOverlay) pauseOverlay.classList.toggle('active', paused);
      if (paused) {
        firing = false;
        pauseAudio();
        sceneEl?.pause?.();
        setAnimatorsPaused(true);
      } else {
        resumeAudio();
        sceneEl?.play?.();
        setAnimatorsPaused(false);
      }
      if (!paused) {
        hud.setStatus('Reanudado');
      }
    }

    window.addEventListener('keydown', (e) => {
      if (gameState === 'ready') {
        if (e.code === 'Space' || e.code === 'Enter') {
          beginGame();
          return;
        }
        const quickStartKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
        if (quickStartKeys.has(e.code)) {
          beginGame();
        }
      }
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyQ') {
        weaponIndex = (weaponIndex + 1) % weapons.length;
        updateWeaponHud();
        hud.setStatus(`Arma: ${currentWeapon().name}`);
      }
      if (e.code === 'KeyF') shootAttack();
      if (gameState === 'playing' && e.code === 'KeyE') {
        const nearest = itemSystem.findNearest(playerEl.object3D.position, cellSize * 0.55);
        if (nearest) {
          const picked = itemSystem.pickup(nearest);
          if (picked) addToInventory(nearest.def);
        } else {
          hud.setStatus('Sin item cercano');
        }
      }
      if (gameState === 'playing' && e.code.startsWith('Digit')) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < inventory.length) {
          selectedSlot = idx;
          if (idx === 0) {
            hud.setStatus('Arma basica');
          } else {
            useSlot(idx);
          }
          syncInventoryHud();
        }
      }
    });

    window.addEventListener('wheel', (e) => {
      if (gameState !== 'playing') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      let next = selectedSlot;
      for (let i = 0; i < inventory.length; i++) {
        next = (next + dir + inventory.length) % inventory.length;
        if (next === 0 || inventory[next]) break;
      }
      selectedSlot = next;
      syncInventoryHud();
      if (selectedSlot === 0) hud.setStatus('Arma basica');
    }, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      if (gameState === 'ready') {
        beginGame();
      }
      if (e.button !== 0) return;
      if (gameState !== 'playing') return;
      const locked = document.pointerLockElement || document.mozPointerLockElement;
      if (!locked) {
        if (sceneEl?.canvas?.requestPointerLock) {
          sceneEl.canvas.requestPointerLock();
        }
        return;
      }
      const target = e.target;
      if (target && target.closest && target.closest('.pause-overlay, .start-overlay, .result-overlay')) {
        return;
      }
      if (selectedSlot > 0 && inventory[selectedSlot]) {
        useSlot(selectedSlot);
        return;
      }
      firing = true;
      shootAttack();
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      firing = false;
    });

    document.addEventListener('pointerlockchange', () => {
      if (!(document.pointerLockElement || document.mozPointerLockElement)) {
        firing = false;
      }
    });

    window.addEventListener('pointerdown', () => {
      if (gameState === 'playing') startAudio();
    }, { once: true });

    window.addEventListener('keydown', () => {
      if (gameState === 'playing') startAudio();
    }, { once: true });

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'pause-action') {
        if (data.action === 'resume') togglePause(false);
        if (data.action === 'save_exit') {
          stopAudio();
          saveSnapshot({
            worldState,
            itemSystem,
            enemyEntities,
            playerEl,
            playerState,
            cellSize,
            wallHeight,
            score,
            killCount,
            saveName: `Manual ${new Date().toLocaleString()}`,
          });
          window.location.href = 'index.html';
        }
        if (data.action === 'exit') {
          if (config.autosaveOnExit) {
            saveSnapshot({
              worldState,
              itemSystem,
              enemyEntities,
              playerEl,
              playerState,
              cellSize,
              wallHeight,
              score,
              killCount,
              saveName: `Auto ${new Date().toLocaleString()}`,
            });
          }
          stopAudio();
          window.location.href = 'index.html';
        }
      }
    });

    if (startBtn) startBtn.addEventListener('click', beginGame);
    if (respawnBtn) respawnBtn.addEventListener('click', respawnPlayer);
    if (shouldAutoStart) {
      beginGame();
    } else if (startOverlay) {
      if (!startOverlay.classList.contains('active')) startOverlay.classList.add('active');
    } else {
      beginGame();
    }

    if (resultRestart) resultRestart.addEventListener('click', () => {
      window.location.reload();
    });
    if (resultSaveExit) resultSaveExit.addEventListener('click', () => {
      stopAudio();
      saveSnapshot({
        worldState,
        itemSystem,
        enemyEntities,
        playerEl,
        playerState,
        cellSize,
        wallHeight,
        score,
        killCount,
        saveName: `Final ${new Date().toLocaleString()}`,
      });
      window.location.href = 'index.html';
    });
    if (resultExit) resultExit.addEventListener('click', () => {
      stopAudio();
      window.location.href = 'index.html';
    });

    refreshHud();
    setLoading(false);

    const baseSpeed = 4;
    startLoop((dt) => {
      if (paused) return;
      if (gameState === 'downed') {
        if (downedCameraActive && cameraEl?.object3D) {
          cameraEl.object3D.position.set(
            playerEl.object3D.position.x + downedCamOffset.x,
            playerEl.object3D.position.y + downedCamOffset.y,
            playerEl.object3D.position.z + downedCamOffset.z,
          );
          cameraEl.object3D.lookAt(
            playerEl.object3D.position.x,
            playerEl.object3D.position.y + 0.4,
            playerEl.object3D.position.z,
          );
        }
        return;
      }
      if (gameState !== 'playing') return;
      elapsedMs += dt * 1000;
      if (elapsedMs - lastHudUpdate > 250) {
        lastHudUpdate = elapsedMs;
        hud.setTime(elapsedMs);
        syncInventoryHud();
        hud.setEffects(buildEffectsHud());
      }
      if (elapsedMs - lastMinimapUpdate > 120) {
        lastMinimapUpdate = elapsedMs;
        updateMinimap();
      }
      if (elapsedMs - lastEnemyFocusUpdate > 140) {
        lastEnemyFocusUpdate = elapsedMs;
        updateEnemyFocus();
      }
      if (cullingEnabled && elapsedMs - lastCullUpdate > cullIntervalMs) {
        lastCullUpdate = elapsedMs;
        const dynamic = [];
        itemSystem.items.forEach((item) => {
          if (!item.picked && item.el?.object3D) dynamic.push(item.el);
        });
        culling.update(staticWalls.concat(dynamic));
      }
      const now = performance.now();
      const weapon = currentWeapon();
      if (weapon?.reloading && now >= weapon.reloadUntil) {
        const needed = Math.max(0, weapon.ammoMax - weapon.ammo);
        const take = Math.min(needed, weapon.reserveAmmo);
        weapon.ammo += take;
        weapon.reserveAmmo -= take;
        weapon.reloading = false;
        updateWeaponHud();
        hud.setStatus('Recarga completa');
      }
      if (weapon?.id === 'minigun') {
        updateWeaponCharges(now, weapon);
      }
      spawnSystem.update(now, { finalPhase });

      if (firing && selectedSlot === 0) {
        const weapon = currentWeapon();
        if (weapon?.id === 'minigun') {
          shootAttack();
        }
      }

      const remaining = [];
      for (const eff of activeEffects) {
        if (eff.expiresAt > now) remaining.push(eff);
      }
      if (remaining.length !== activeEffects.length) {
        activeEffects.length = 0;
        remaining.forEach((e) => activeEffects.push(e));
        if (!activeEffects.find((e) => e.name === 'Velocidad')) playerState.speedMult = 1;
        if (!activeEffects.find((e) => e.name === 'Congelar')) enemyEntities.forEach((e) => { e.speed = e.baseSpeed; });
        if (!activeEffects.find((e) => e.name === 'Caza')) enemyEntities.forEach((e) => { e.speed = e.baseSpeed; });
        if (!activeEffects.find((e) => e.name === 'Lento')) enemyEntities.forEach((e) => { e.speed = e.baseSpeed; });
        if (!activeEffects.find((e) => e.name === 'Escudo')) playerState.shield = 0;
        if (!activeEffects.find((e) => e.name === 'Invisible')) playerState.invisible = false;
        refreshHud();
      }

      const frenzySpeed = frenzyActive ? frenzySpeedMult : 1;
      playerEl.setAttribute('room-player', 'speed', baseSpeed * playerState.speedMult * frenzySpeed);
      const dashCooldown = engineConfig.dashCooldown * (frenzyActive ? frenzyCooldownMult : 1);
      playerEl.setAttribute('room-player', 'dashCooldown', dashCooldown);
      itemSystem.update(playerEl.object3D.position);
      if (gameState === 'playing') {
        const pickupRadius = cellSize * 1.6;
        const playerPos = playerEl.object3D.position;
        for (const item of itemSystem.items) {
          if (!item || item.picked) continue;
          const id = item.def?.id;
          if (id !== 'ammo_light' && id !== 'ammo_heavy') continue;
          const pos = item.el?.object3D?.position;
          if (!pos) continue;
          const dist = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
          if (dist <= pickupRadius) {
            const picked = itemSystem.pickup(item);
            if (picked) addToInventory(item.def);
          }
        }
      }
      updateItemFocus();
      aiSystem.update(dt);
      updatePlayerAnim(dt);

      if (typeof hud.setDash === 'function') {
        const dashComp = playerEl.components?.['room-player'];
        const dashCd = dashComp?.data?.dashCooldown ?? dashCooldown;
        const lastDash = dashComp?.lastDashAt ?? -Infinity;
        const since = (now - lastDash) / 1000;
        const remaining = Math.max(0, dashCd - since);
        const count = Number.isFinite(dashComp?.dashCharges) ? dashComp.dashCharges : (remaining <= 0 ? 1 : 0);
        hud.setDash(count, remaining);
      }

      enemyEntities.forEach((enemy) => {
        if (!enemy?.el || !enemy.anim) return;
        if (enemy.dead) return;
        const pos = enemy.el.object3D.position;
        const lastPos = enemy.anim.lastPos;
        const dx = pos.x - lastPos.x;
        const dz = pos.z - lastPos.z;
        lastPos.copy(pos);
        const speed = Math.hypot(dx, dz) / Math.max(0.016, dt);

        if (now < enemy.anim.attackUntil) {
          setEnemyAnim(enemy, 'attack', { once: true });
          return;
        }

        if (speed > 1.4) {
          setEnemyAnim(enemy, 'run');
        } else if (speed > 0.35) {
          setEnemyAnim(enemy, 'walk');
        } else {
          setEnemyAnim(enemy, 'idle');
        }
      });

      const grounded = playerEl.components?.['room-player']?.grounded;
      if (grounded && currentMoveSpeed > 0.6) {
        const interval = Math.max(0.2, 0.65 - currentMoveSpeed * 0.07);
        if (now - lastStepAt >= interval * 1000) {
          lastStepAt = now;
          playFootstep();
        }
      } else {
        lastStepAt = performance.now();
      }

      if (elapsedMs - lastAutoSaveAt > AUTO_SAVE_INTERVAL_MS) {
        lastAutoSaveAt = elapsedMs;
        saveSnapshot({
          worldState,
          itemSystem,
          enemyEntities,
          playerEl,
          playerState,
          cellSize,
          wallHeight,
          score,
          killCount,
          saveName: 'Auto (ultimo)',
          saveId: AUTO_SAVE_ID,
        });
      }

      if (goalCell) {
        const cell = worldToCell(playerEl.object3D.position, cellSize);
        const atGoal = cell.x === goalCell.x && cell.y === goalCell.y;
        if (atGoal && !finalPhase) {
          startFinalPhase();
        }
      }

      if (finalPhase) {
        const remaining = finalEndsAt - now;
        hud.setFinalTimer(remaining, true);
        const spawnInterval = finalSpawnIntervalMs * (frenzyActive ? frenzyCooldownMult : 1);
        if (now - lastEnemySpawnAt >= spawnInterval) {
          lastEnemySpawnAt = now;
          spawnEnemyWave(1);
        }
        if (remaining <= 0) {
          finishGame('won');
        }
      } else {
        hud.setFinalTimer(0, false);
      }

    });

    logger.info('Game iniciado');
  };

  if (sceneEl.hasLoaded) {
    setup();
  } else {
    sceneEl.addEventListener('loaded', setup, { once: true });
  }
}

initGame().catch((err) => {
  console.error(err);
});
