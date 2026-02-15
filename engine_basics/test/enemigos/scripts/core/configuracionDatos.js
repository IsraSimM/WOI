
/* ajuste de calibración y configuracion */ 

// ============= REFERENCIAS DOM =============
const roomEl = document.getElementById('room');
const floorEl = document.getElementById('floor');
const bobToggle = document.getElementById('bobToggle');
const headEl = document.getElementById('head');
const bodyEl = document.getElementById('body');
const cameraEl = headEl?.querySelector('[camera]');
const modeSelect = document.getElementById('modeSelect');
const invListEl = document.getElementById('invList');
const availListEl = document.getElementById('availList');
const invCountEl = document.getElementById('invCount');
const invMaxEl = document.getElementById('invMax');
const invMaxLabelEl = document.getElementById('invMaxLabel');
const availCountEl = document.getElementById('availCount');
const statusEl = document.getElementById('statusMsg');
const coordXEl = document.getElementById('coordX');
const coordYEl = document.getElementById('coordY');
const coordZEl = document.getElementById('coordZ');
const coordCellEl = document.getElementById('coordCell');
const compassEl = document.getElementById('compass');
const compassNeedleEl = document.getElementById('compassNeedle');
const headingEl = document.getElementById('headingDeg');
const focusPanelEl = document.getElementById('focusPanel');
const focusNameEl = document.getElementById('focusName');
const focusDescEl = document.getElementById('focusDesc');

// ============= CONSTANTES DE CONFIGURACIÓN =============
const CALIB_KEY = 'mazeAssetCalibration';
const ITEMS_URL = '../game_data/items/items.json';
const ROOM_W = 5;  // Ancho para mini arena
const ROOM_D = 5;  // Profundidad para mini arena
const WALL_LAYERS = 2;  // Altura de 2 bloques para el mini escenario

// ============= CARGA DE CALIBRACIÓN =============
function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIB_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

const calib = loadCalibration() || {};

// ============= CONFIGURACIÓN DE DIMENSIONES =============
const CELL_SIZE = Number.isFinite(calib.cellSize) ? calib.cellSize : 6;
const ASSET_SIZE = Number.isFinite(calib.assetSize) ? calib.assetSize : 6;
const WALL_SCALE = Number.isFinite(calib.wallScale) ? calib.wallScale : 1;
const ASSET_ORIGIN = (calib.assetOrigin === 'base' || calib.assetOrigin === 'center') ? calib.assetOrigin : 'center';

const FULL_ADJ = {
  pos: {
    x: Number(calib.adjust?.full?.pos?.x) || 0,
    y: Number(calib.adjust?.full?.pos?.y) || 0,
    z: Number(calib.adjust?.full?.pos?.z) || 0,
  },
  rotY: Number(calib.adjust?.full?.rotY) || 0,
  scale: Number(calib.adjust?.full?.scale) || 1,
};

const COLLIDER_ADJ = {
  x: Number(calib.adjust?.full?.collider?.x) || 0,
  y: Number(calib.adjust?.full?.collider?.y) || 0,
  z: Number(calib.adjust?.full?.collider?.z) || 0,
};

const MODEL_SCALE = (CELL_SIZE / ASSET_SIZE) * WALL_SCALE * FULL_ADJ.scale;
const BLOCK_SIZE = CELL_SIZE * WALL_SCALE * FULL_ADJ.scale;
const WALL_EDGE_SHIFT = (BLOCK_SIZE - CELL_SIZE) * 0.5;
const halfW = (ROOM_W - 1) * CELL_SIZE * 0.5;
const halfD = (ROOM_D - 1) * CELL_SIZE * 0.5;
const wallHeight = WALL_LAYERS * BLOCK_SIZE;
const baseY = ASSET_ORIGIN === 'center' ? (BLOCK_SIZE * 0.5) : 0;

// ============= CONFIGURACIÓN DE ITEMS =============
const ITEM_BASE_SCALE = (CELL_SIZE / ASSET_SIZE) * 0.55;
const ITEM_BASE_Y = BLOCK_SIZE * 0.15;
const ITEM_Y_OFFSET = -BLOCK_SIZE * 0.05;
const ITEM_FOCUS_DISTANCE = CELL_SIZE * 1.6;
const ITEM_FOCUS_DOT = 0.94;

// ============= LÍMITES POR MODO DE JUEGO =============
const MODE_LIMITS = {
  casual: 6,
  normal: 4,
  dificil: 2,
  hardcore: 1,
};

// ============= ARRAYS GLOBALES =============
const colliders = [];
const itemsState = [];
const inventory = [];

// ============= VECTORES REUTILIZABLES =============
const headingVector = new THREE.Vector3();
const cameraWorldPos = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const itemWorldPos = new THREE.Vector3();
const toItemDir = new THREE.Vector3();

// ============= UTILIDADES =============
let statusTimer = null;

function resolveAssetPath(path) {
  if (!path || typeof path !== 'string') return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/')) return path;
  if (path.startsWith('../') || path.startsWith('./')) return path;
  return `../${path}`;
}