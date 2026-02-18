import CONFIG from '../game_engine/core/config.js';
import { CELL } from '../game_engine/core/constants.js';
import { startLoop } from '../game_engine/core/time.js';
import { logger } from '../game_engine/core/logger.js';
import { fetchJson } from '../game_engine/data/json_loader.js';
import {
  ITEMS_URL,
  ENTITIES_URL,
  WORLD_01_URL,
  WORLD_01_ENTITIES_URL,
  WORLD_01_PLAYERS_URL,
  resolveGameUrl,
} from '../game_engine/data/paths.js';
import { loadWorld, worldToCell } from '../game_engine/world/loader.js';
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
import { mountHud } from './ui/hud/hud.js';
import { generateSpawnPoints } from '../game_engine/generation/world_generation/spawns.js';

const LEGACY_SAVE_KEY = 'world_snapshot_v1';
const SAVE_LIST_KEY = 'world_snapshots_v1';
const SAVE_LATEST_KEY = 'world_snapshot_latest_v1';
const AUTO_SAVE_ID = 'auto_latest';
const AUTO_SAVE_INTERVAL_MS = 45000;
const CONFIG_KEY = 'game_config_v1';
const ENGINE_CONFIG_KEY = 'engine_config_v1';
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
    minimapRadius: 7,
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
  list.push(entry);
  saveSnapshots(list);
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
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  saveSnapshots(list);
  localStorage.setItem(SAVE_LATEST_KEY, entry.id);
  return entry;
}

function buildWorldStateFromSnapshot(snapshot) {
  const map = snapshot.map instanceof Uint8Array ? snapshot.map : new Uint8Array(snapshot.map || []);
  return createWorldState({
    map,
    width: snapshot.width,
    height: snapshot.height,
    meta: snapshot.meta || {},
    items: snapshot.spawns?.items || [],
    enemies: snapshot.spawns?.enemies || [],
    playerSpawn: snapshot.settings?.playerSpawn || snapshot.meta?.start || { x: 1, y: 1 },
    mode: snapshot.settings?.mode || 'modo_classic',
    difficulty: snapshot.settings?.difficulty || 'normal',
  });
}

function saveSnapshot({ worldState, itemSystem, enemyEntities, playerEl, playerState, cellSize, saveName, saveId = null }) {
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
      mode: worldState.mode,
      difficulty: worldState.difficulty,
      playerSpawn: playerCell,
      playerLives: playerState.lives,
    },
  });

  if (saveId) upsertSnapshot(snapshot, saveName, saveId);
  else addSnapshot(snapshot, saveName);
  return snapshot;
}

function resolveBehavior(id, behavior) {
  if (behavior) return behavior;
  if (id === 'enemy_advanced' || id === 'enemy_strategist') return 'ambusher';
  if (id === 'enemy_speedster') return 'wanderer';
  return 'chaser';
}

async function initGame() {
  const sceneEl = document.querySelector('#scene');
  if (!sceneEl) return;

  const playerEl = document.querySelector('#player');
  const cameraEl = playerEl?.querySelector('[camera]');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const startOverlay = document.getElementById('startOverlay');
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
  const previewPanel = document.getElementById('previewPanel');
  const previewToggle = document.getElementById('previewToggle');
  const previewCanvas = document.getElementById('thirdPersonCanvas');
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
  let stepIndex = 0;
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
  }

  function pauseAudio() {
    if (!audioStarted || audioPaused) return;
    audioPaused = true;
    introAudio.pause();
    loopAudio.pause();
    stepAudioPool.forEach((audio) => audio.pause());
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

    const previewState = {
      active: true,
    renderer: null,
    camera: null,
    forward: window.THREE ? new THREE.Vector3() : null,
    target: window.THREE ? new THREE.Vector3() : null,
    position: window.THREE ? new THREE.Vector3() : null,
    up: window.THREE ? new THREE.Vector3(0, 1, 0) : null,
  };

  function initPreview(sceneEl, cameraEl) {
    if (!previewCanvas || !window.THREE) return;
    const rect = previewCanvas.getBoundingClientRect();
    const baseWidth = rect.width || previewCanvas.width || 240;
    const baseHeight = rect.height || previewCanvas.height || 150;
    const renderer = new THREE.WebGLRenderer({
      canvas: previewCanvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(baseWidth, baseHeight, false);
    if (renderer.outputColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

    const cam = new THREE.PerspectiveCamera(60, baseWidth / baseHeight, 0.1, 1000);
    previewState.renderer = renderer;
    previewState.camera = cam;

    const resize = () => {
      if (!previewState.renderer || !previewState.camera) return;
      const size = previewCanvas.getBoundingClientRect();
      const width = size.width || previewCanvas.width || baseWidth;
      const height = size.height || previewCanvas.height || baseHeight;
      previewState.renderer.setSize(width, height, false);
      previewState.camera.aspect = width / height || 1;
      previewState.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);

    if (previewPanel) previewPanel.classList.add('active');

    if (previewToggle) {
      previewToggle.addEventListener('click', () => {
        previewState.active = !previewState.active;
        if (previewPanel) previewPanel.classList.toggle('active', previewState.active);
        resize();
      });
    }

    return { sceneEl, cameraEl };
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

    const [itemsData, entitiesData] = await Promise.all([
      fetchJson(ITEMS_URL),
      fetchJson(ENTITIES_URL),
    ]);

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
    const paramMinimapRadius = Number(params.get('minimapRadius'));
    const minimapRadius = Math.max(
      3,
      Number.isFinite(paramMinimapRadius) ? paramMinimapRadius : engineConfig.minimapRadius,
    );

    const itemIds = Array.isArray(itemsData)
      ? Array.from(new Set(itemsData.filter((item) => item && item.asset).map((item) => item.id)))
      : [];
    const enemyDefs = Array.isArray(entitiesData?.enemies) ? entitiesData.enemies : [];
    const enemyIds = Array.from(new Set(enemyDefs.filter((enemy) => enemy && enemy.asset).map((enemy) => enemy.id)));

    let snapshotEntry = null;
    if (loadMode === 'save' && saveId) snapshotEntry = loadSnapshotById(saveId);
    if (!snapshotEntry && (loadMode === 'latest' || loadMode === 'auto')) snapshotEntry = loadLatestSnapshot();
    const shouldAutoStart = Boolean(snapshotEntry);

    let worldState;
    let playerLives = Number(config.lives) || 3;
    let worldArea = 0;

    if (snapshotEntry && loadMode !== 'new' && loadMode !== 'world_01') {
      setLoading(true, 'Cargando snapshot...');
      worldState = buildWorldStateFromSnapshot(snapshotEntry.data);
      worldArea = worldState.width * worldState.height;
      if (Number.isFinite(snapshotEntry.data.settings?.playerLives)) {
        playerLives = snapshotEntry.data.settings.playerLives;
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
      const useWorld01 = loadMode === 'world_01';
      worldArea = width * height;
      if (worldArea >= 900) {
        setLoading(true, 'Generando mundo grande...');
      } else {
        setLoading(true, 'Generando mundo...');
      }
      worldState = await loadWorld({
        worldUrl: useWorld01 ? WORLD_01_URL : null,
        entitiesUrl: useWorld01 ? WORLD_01_ENTITIES_URL : null,
        playersUrl: useWorld01 ? WORLD_01_PLAYERS_URL : null,
        width,
        height,
        seed: paramSeed || config.seed || null,
        pacmanize: paramPacman,
        openBorders: false,
        itemIds,
        enemyIds,
        itemsCount: 6,
        enemiesCount: enemyIds.length,
      });
      if (paramMode || config.mode) worldState.mode = paramMode || config.mode;
      if (paramDiff || config.difficulty) worldState.difficulty = paramDiff || config.difficulty;
      if (paramWorldName) {
        worldState.meta = worldState.meta || {};
        worldState.meta.name = paramWorldName;
      }
    }

    const itemIdSet = new Set(itemIds);
    if (Array.isArray(worldState?.items)) {
      worldState.items = worldState.items.filter((entry) => entry && itemIdSet.has(entry.id));
    }

    const cellSize = CONFIG.defaults.cellSize;
    const wallHeight = Number.isFinite(paramWallHeight) ? Math.max(1, Math.round(paramWallHeight)) : CONFIG.defaults.wallHeight;
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

    const playerAssetUrl = encodeURI(resolveGameUrl(PLAYER_MODEL.asset));
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
      lives: playerLives,
      speedMult: 1,
      shield: 0,
      invisible: false,
    };

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
          if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
          mat.color.copy(mat.userData.baseColor).lerp(mask, strength);
          if ('emissive' in mat) {
            if (!mat.userData.baseEmissive) mat.userData.baseEmissive = (mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000));
            mat.emissive.copy(mat.userData.baseEmissive).lerp(mask, strength * 0.45);
            if (Number.isFinite(options.emissiveIntensity)) mat.emissiveIntensity = options.emissiveIntensity;
          }
          if (Number.isFinite(options.roughness)) mat.roughness = options.roughness;
          if (Number.isFinite(options.metalness)) mat.metalness = options.metalness;
          mat.needsUpdate = true;
        });
        node.material = Array.isArray(node.material) ? cloned : cloned[0];
      });
    }

    function spawnEnemyEntity(spawnEntry) {
      const def = entitiesData.enemies?.find((e) => e.id === spawnEntry.id);
      const baseSpeed = spawnEntry.id === 'enemy_speedster' ? 1.6 : 1.1;
      const behavior = resolveBehavior(spawnEntry.id, spawnEntry.behavior);
      const posX = spawnEntry.x * cellSize;
      const posZ = spawnEntry.y * cellSize;

      let el;
      const baseEntityY = 0;
      if (ENEMY_MODEL.asset) {
        el = document.createElement('a-entity');
        el.setAttribute('gltf-model', '#mdl-enemy');
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
          if (def?.color) applyColorMask(mesh, def.color, 0.85, {
            emissiveIntensity: 0.45,
            roughness: 0.35,
            metalness: 0.2,
          });
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
      const enemyObj = {
        id: spawnEntry.id,
        el,
        speed: baseSpeed,
        baseSpeed,
        behavior,
        turnSpeed: 6,
        yawOffset,
        hitRadius,
        anim: {
          lastPos: new THREE.Vector3(posX, baseEntityY, posZ),
          current: null,
          attackUntil: 0,
        },
      };
      enemyEntities.push(enemyObj);
      return enemyObj;
    }

    worldState.enemies.forEach((enemy) => {
      spawnEnemyEntity(enemy);
    });

    let killCount = 0;
    hud.setElims(killCount);

    function removeEnemy(enemy, reason = '') {
      if (!enemy) return;
      if (enemy?.el) enemy.el.parentNode?.removeChild(enemy.el);
      const idx = enemyEntities.indexOf(enemy);
      if (idx >= 0) enemyEntities.splice(idx, 1);
      killCount += 1;
      hud.setElims(killCount);
      if (reason) hud.setStatus(reason);
    }

    const activeEffects = [];
    function addEffect(name, durationMs) {
      const expiresAt = performance.now() + durationMs;
      activeEffects.push({ name, expiresAt });
    }

    const inventory = new Array(4).fill(null);
    inventory[0] = {
      id: 'arma_basica',
      nombre: 'ARMA BASICA',
      locked: true,
      cooldownMs: 0,
      usesRemaining: null,
      lastUsedAt: -Infinity,
    };
    let selectedSlot = 0;

    function syncInventoryHud() {
      const labels = inventory.map((item) => (item ? item.nombre || item.id : null));
      hud.setItems(labels);
    }

    function refreshHud() {
      hud.setMode(worldState.mode);
      hud.setDifficulty(worldState.difficulty);
      hud.setLives(playerState.lives);
      if (typeof hud.setSpeed === 'function') {
        const speedFactor = playerState.speedMult * (frenzyActive ? FRENZY_SPEED_MULT : 1);
        hud.setSpeed(speedFactor);
      }
      syncInventoryHud();
      hud.setEffects(activeEffects.filter((e) => !e.name.startsWith('item:')).map((e) => e.name));
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

    function triggerAttack() {
      if (gameState !== 'playing') return;
      const now = performance.now();
      const cooldown = attackCooldownMs * (frenzyActive ? FRENZY_COOLDOWN_MULT : 1);
      if (now - lastAttackAt < cooldown) return;
      lastAttackAt = now;
      const attackDuration = Math.max(200, cooldown);
      attackUntil = now + attackDuration;
      setPlayerAnim('attack', { once: true, force: true });
      combatSystem?.meleeAttack?.();
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
        playerState.lives += extra;
        addEffect('Vida+', effects.duracion_ms || 2500);
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
            removeEnemy(enemy, 'Explosion');
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
      },
    });

    syncInventoryHud();

    function addToInventory(def) {
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
      selectedSlot = slot;
      syncInventoryHud();
      hud.setStatus(`Slot ${slot + 1}: ${inventory[slot].nombre}`);
      return true;
    }

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
      const cooldown = item.cooldownMs * (frenzyActive ? FRENZY_COOLDOWN_MULT : 1);
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

    initPreview(sceneEl, cameraEl);

    const camDir = new THREE.Vector3();
    const camQuat = new THREE.Quaternion();
    const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const focusDir = new THREE.Vector3();
    const focusVec = new THREE.Vector3();
    let focusedItemId = null;

    function updateMinimap() {
      if (typeof hud.updateMinimap !== 'function') return;
      const playerCell = worldToCell(playerEl.object3D.position, cellSize);
      const enemyCells = enemyEntities.map((enemy) => worldToCell(enemy.el.object3D.position, cellSize));
      const itemCells = itemSystem.getRemaining().map((item) => ({ x: item.x, y: item.y }));
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
      focusDir.y = 0;
      if (focusDir.lengthSq() === 0) return;
      focusDir.normalize();

      const playerPos = playerEl.object3D.position;
      const maxDist = cellSize * 1.1;
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

    function renderResultStats() {
      if (!resultStats) return;
      const remainingItems = itemSystem.getRemaining().length;
      const collectedItems = Math.max(0, initialItems - remainingItems);
      const lines = [
        { label: 'Tiempo', value: formatDuration(elapsedMs) },
        { label: 'Items', value: `${collectedItems}/${initialItems}` },
        { label: 'Enemigos', value: `${enemyEntities.length}` },
        { label: 'Mapa', value: `${worldState.width}x${worldState.height}` },
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
    let invulnerableUntil = 0;
    let lastAutoSaveAt = 0;
    let finalPhase = false;
    let finalEndsAt = 0;
    let lastEnemySpawnAt = 0;
    let frenzyActive = false;

    function setEffect(name, durationMs) {
      const expiresAt = performance.now() + durationMs;
      const idx = activeEffects.findIndex((e) => e.name === name);
      if (idx >= 0) activeEffects.splice(idx, 1);
      activeEffects.push({ name, expiresAt });
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
      finalEndsAt = performance.now() + FINAL_DURATION_MS;
      setEffect('Frenesi', FINAL_DURATION_MS);
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
      setAnimatorsPaused(true);
      finalPhase = false;
      frenzyActive = false;
      hud.setFinalTimer(0, false);
      if (pauseOverlay) pauseOverlay.classList.remove('active');
      if (resultOverlay) resultOverlay.classList.add('active');

      const title = outcome === 'won' ? 'Victoria' : 'Derrota';
      const msg = outcome === 'won'
        ? `Objetivo completado - Tiempo: ${formatDuration(elapsedMs)}`
        : `Se acabaron las vidas - Tiempo: ${formatDuration(elapsedMs)}`;

      if (resultTitle) resultTitle.textContent = title;
      if (resultMessage) resultMessage.textContent = msg;
      renderResultStats();
      hud.setTime(elapsedMs);
      hud.setStatus(title);
      if (outcome !== 'won') {
        setPlayerAnim('death', { once: true, force: true });
      }
    }

    const aiSystem = createAISystem({
      map: worldState.map,
      width: worldState.width,
      height: worldState.height,
      cellSize,
      enemies: enemyEntities,
      getPlayerPosition: () => playerEl.object3D.position,
      onPlayerHit: (enemy) => {
        const now = performance.now();
        if (activeEffects.find((e) => e.name === 'Caza')) {
          removeEnemy(enemy, 'Enemigo eliminado');
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
        playerState.lives -= 1;
        refreshHud();
        hud.setStatus('Te golpearon');
        playerEl.setAttribute('position', `${spawn.x * cellSize} 0 ${spawn.y * cellSize}`);
        grantInvulnerability(5000);
        if (playerState.lives <= 0) {
          finishGame('lost');
        }
      },
    });

    combatSystem = createCombatSystem({
      playerEl,
      cameraEl,
      enemies: enemyEntities,
      cellSize,
      onKill: (enemy) => removeEnemy(enemy, 'Enemigo eliminado'),
    });

    function togglePause(force) {
      if (gameState !== 'playing') return;
      paused = typeof force === 'boolean' ? force : !paused;
      if (pauseOverlay) pauseOverlay.classList.toggle('active', paused);
      if (paused) {
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
      if (gameState === 'ready' && (e.code === 'Space' || e.code === 'Enter')) {
        beginGame();
        return;
      }
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyF') triggerAttack();
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
        }
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (gameState !== 'playing') return;
      const locked = document.pointerLockElement || document.mozPointerLockElement;
      if (!locked) return;
      const target = e.target;
      if (target && target.closest && target.closest('.preview-panel, .pause-overlay, .start-overlay, .result-overlay')) {
        return;
      }
      triggerAttack();
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
          saveSnapshot({ worldState, itemSystem, enemyEntities, playerEl, playerState, cellSize, saveName: `Manual ${new Date().toLocaleString()}` });
          window.location.href = 'index.html';
        }
        if (data.action === 'exit') {
          if (config.autosaveOnExit) {
            saveSnapshot({ worldState, itemSystem, enemyEntities, playerEl, playerState, cellSize, saveName: `Auto ${new Date().toLocaleString()}` });
          }
          stopAudio();
          window.location.href = 'index.html';
        }
      }
    });

    if (startBtn) startBtn.addEventListener('click', beginGame);
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
      saveSnapshot({ worldState, itemSystem, enemyEntities, playerEl, playerState, cellSize, saveName: `Final ${new Date().toLocaleString()}` });
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
      if (!paused && gameState === 'playing' && previewState.active && previewState.renderer && previewState.camera) {
        const camRef = cameraEl || sceneEl.querySelector('[camera]');
        const camObj = camRef?.object3D;
        if (camObj) {
          camObj.getWorldPosition(previewState.target);
          camObj.getWorldDirection(previewState.forward);
          const distance = 4.2;
          const height = 2.0;
          previewState.position.copy(previewState.target);
          previewState.position.addScaledVector(previewState.forward, -distance);
          previewState.position.addScaledVector(previewState.up, height);
          previewState.camera.position.copy(previewState.position);
          previewState.camera.lookAt(
            playerEl.object3D.position.x,
            playerEl.object3D.position.y + 1.2,
            playerEl.object3D.position.z,
          );
          previewState.renderer.render(sceneEl.object3D, previewState.camera);
        }
      }

      if (paused || gameState !== 'playing') return;
      elapsedMs += dt * 1000;
      if (elapsedMs - lastHudUpdate > 250) {
        lastHudUpdate = elapsedMs;
        hud.setTime(elapsedMs);
      }
      if (elapsedMs - lastMinimapUpdate > 120) {
        lastMinimapUpdate = elapsedMs;
        updateMinimap();
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

      const frenzySpeed = frenzyActive ? FRENZY_SPEED_MULT : 1;
      playerEl.setAttribute('room-player', 'speed', baseSpeed * playerState.speedMult * frenzySpeed);
      const dashCooldown = engineConfig.dashCooldown * (frenzyActive ? FRENZY_COOLDOWN_MULT : 1);
      playerEl.setAttribute('room-player', 'dashCooldown', dashCooldown);
      itemSystem.update(playerEl.object3D.position);
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
        const spawnInterval = FINAL_SPAWN_INTERVAL_MS * (frenzyActive ? FRENZY_COOLDOWN_MULT : 1);
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
