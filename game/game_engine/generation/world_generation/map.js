//Consideraciones generales:
//Muchas funciones del laberinto y partes de la generacion endless son robadas de:
//https://github.com/Lukas-De-Angelis-Riva/Solucionador

//Igual esta idea esta muy padre por si les gustan estas cositas :)
//https://weblog.jamisbuck.org/2011/3/4/maze-generation-weave-mazes.html

//Le comente un pelin con el chat y muchas partes son literal copias de codigo de git de repos de laberintos

//Estas fueron referencias para las salas, tambien me fundamente en TBOI para las salas y su generacion :)
//https://catlikecoding.com/unity/tutorials/maze/


export const CELL = Object.freeze({
  PATH: 0,
  WALL: 1,
  ENTRANCE: 2,
  EXIT: 3,
  START: 4,
  END: 5,
});

export class MapGenerator {
  constructor(width, height, {
    blockType = 'a_Frame',
    seed = null,
    titanic = false,
    titanicChunkSize = 256,     // para render / muestreo, no para almacenar
    maxBfsStepsTitanic = 2_000_000, // límite para BFS en titánico
  } = {}) {
    this.blockType = blockType;
    const seedInfo = normalizeSeed(seed);
    this.seed = seedInfo.seed;
    this.seedSource = seedInfo.source;
    this.rand = mulberry32(this.seed);

    this.titanic = !!titanic;
    this.titanicChunkSize = Math.max(32, titanicChunkSize | 0);
    this.maxBfsStepsTitanic = Math.max(100_000, maxBfsStepsTitanic | 0);

    const norm = normalizeMazeSize(width, height);
    this.width = norm.width;
    this.height = norm.height;

    this.map = null; // Uint8Array
    this.meta = {
      entrance: null,
      exit: null,
      start: null,
      end: null,
      seed: this.seed,
      seedSource: this.seedSource,
    };
  }

  applyRooms({
    attempts = 0,
    minSize = 3,
    maxSize = 9,
    template = null,
    templateSize = 16,
    forceTemplate = false,
  } = {}) {
    if (!this.map) this._allocMap(CELL.WALL);
    attempts = Math.max(0, attempts | 0);
    if (!attempts) return 0;

    const w = this.width;
    const h = this.height;
    const pathValue = CELL.PATH;
    const wallValue = CELL.WALL;

    if (template != null) {
      const norm = normalizeRoomTemplate(template, Math.max(2, templateSize | 0));
      const rotations = norm ? buildTemplateRotations(norm, Math.max(2, templateSize | 0)) : [];
      if (rotations.length) {
        applyTemplateRooms({
          map: this.map,
          width: w,
          height: h,
          attempts,
          rotations,
          pathValue,
          wallValue,
          forceTemplate: !!forceTemplate,
          rand: this.rand,
        });
      }
      return attempts;
    }

    applyRectRooms({
      map: this.map,
      width: w,
      height: h,
      attempts,
      minSize,
      maxSize,
      pathValue,
      rand: this.rand,
    });
    return attempts;
  }

  reseed(seed = null) {
    const seedInfo = normalizeSeed(seed);
    this.seed = seedInfo.seed;
    this.seedSource = seedInfo.source;
    this.rand = mulberry32(this.seed);
    if (this.meta) {
      this.meta.seed = this.seed;
      this.meta.seedSource = this.seedSource;
    }
    return this.seed;
  }

  reset({ keepSeed = true } = {}) {
    if (!keepSeed) this.reseed(null);
    this.map = null;
    if (this.meta) {
      this.meta.entrance = null;
      this.meta.exit = null;
      this.meta.start = null;
      this.meta.end = null;
    }
    return this;
  }

  // ---------- API principal ----------

  generateMaze({ ensureBorderWalls = true, carveToBorder = false } = {}) {
    this._allocMap(CELL.WALL); // todo muro
    if (ensureBorderWalls) this._forceBorderWalls();

    // Elegimos un punto inicial válido (impar, dentro del borde)
    const sx = clampOdd(1 + ((this.rand() * (this.width - 2)) | 0), 1, this.width - 2);
    const sy = clampOdd(1 + ((this.rand() * (this.height - 2)) | 0), 1, this.height - 2);

    this._carveIterativeDFS(sx, sy);
    if (!ensureBorderWalls && carveToBorder) {
      this._extendPathsToBorder();
    }
    return this.getMap2DView();
  }

  // “Pacmanize”: elimina callejones sin salida.
  // Si openBorders=true, abre el borde completo (sin muros).
  pacmanizeMap({ openBorders = false, protectGoals = true } = {}) {
    if (!this.map) return this.getMap2DView();
    if (openBorders) this._openBorderPaths();
    this._removeDeadEnds({ protectGoals });
    return this.getMap2DView();
  }

  openBorders() {
    if (!this.map) return this.getMap2DView();
    this._openBorderPaths();
    return this.getMap2DView();
  }

  addRoom(x, y, width, height) {
    if (!this.map) this._allocMap(CELL.WALL);
    const x0 = clamp(x | 0, 0, this.width - 1);
    const y0 = clamp(y | 0, 0, this.height - 1);
    const x1 = clamp((x + width) | 0, 0, this.width);
    const y1 = clamp((y + height) | 0, 0, this.height);

    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) {
        this.map[row + xx] = CELL.PATH;
      }
    }
    return this.getMap2DView();
  }

  setBlock(x, y, value) {
    if (!this.map) this._allocMap(CELL.WALL);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return this.getMap2DView();
    this.map[y * this.width + x] = value | 0;
    return this.getMap2DView();
  }

  getMap() {
    return this.map; // Uint8Array (1D)
  }

  getCell(x, y) {
    if (!this.map) return null;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.map[y * this.width + x];
  }

  // Para compatibilidad (si quieres 2D)
  getMap2DView() {
    if (!this.map) return [];
    const out = Array(this.height);
    for (let y = 0; y < this.height; y++) {
      const row = new Array(this.width);
      const off = y * this.width;
      for (let x = 0; x < this.width; x++) row[x] = this.map[off + x];
      out[y] = row;
    }
    return out;
  }

  // Vista 2D de una ventana (x0,y0) inclusive, (x1,y1) exclusive
  getViewport2D(x0, y0, x1, y1) {
    if (!this.map) return [];
    x0 = clamp(x0 | 0, 0, this.width);
    y0 = clamp(y0 | 0, 0, this.height);
    x1 = clamp(x1 | 0, 0, this.width);
    y1 = clamp(y1 | 0, 0, this.height);
    if (x1 <= x0 || y1 <= y0) return [];

    const out = Array(y1 - y0);
    for (let y = y0; y < y1; y++) {
      const row = new Array(x1 - x0);
      const off = y * this.width;
      for (let x = x0; x < x1; x++) row[x - x0] = this.map[off + x];
      out[y - y0] = row;
    }
    return out;
  }

  // Render completo (solo recomendable para tamaños moderados)
  render({ wall = '██', path = '  ' } = {}) {
    if (!this.map) return '';
    // En titánico, evita el render completo accidental.
    if (this.titanic && (this.width * this.height > 3_000_000)) {
      return '[Titanic mode] Usa renderViewport() o renderStream().';
    }

    const w = this.width, h = this.height;
    const lines = new Array(h);
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let s = '';
      for (let x = 0; x < w; x++) {
        const v = this.map[off + x];
        s += (v === 1) ? wall : path;
      }
      lines[y] = s;
    }
    return lines.join('\n');
  }

  // Render de una “ventana” (ideal para titánico): (x0,y0) inclusive, (x1,y1) exclusive
  renderViewport(x0, y0, x1, y1, { wall = '██', path = '  ' } = {}) {
    if (!this.map) return '';
    x0 = clamp(x0 | 0, 0, this.width);
    y0 = clamp(y0 | 0, 0, this.height);
    x1 = clamp(x1 | 0, 0, this.width);
    y1 = clamp(y1 | 0, 0, this.height);
    if (x1 <= x0 || y1 <= y0) return '';

    const w = this.width;
    const lines = [];
    for (let y = y0; y < y1; y++) {
      const off = y * w;
      let s = '';
      for (let x = x0; x < x1; x++) {
        const v = this.map[off + x];
        s += (v === 1) ? wall : path;
      }
      lines.push(s);
    }
    return lines.join('\n');
  }

  // Render en streaming por bandas verticales/horizontales para no “reventar” memoria de string.
  // onChunk(str, {y0,y1}) se llama por cada bloque renderizado.
  renderStream({
    bandHeight = 128,
    wall = '██',
    path = '  ',
    onChunk = (str) => console.log(str)
  } = {}) {
    if (!this.map) return;
    bandHeight = Math.max(1, bandHeight | 0);
    const h = this.height;
    for (let y = 0; y < h; y += bandHeight) {
      const y1 = Math.min(h, y + bandHeight);
      const str = this.renderViewport(0, y, this.width, y1, { wall, path });
      onChunk(str, { y0: y, y1 });
    }
  }

  // ---------- Entrada/Salida y Start/End (lo más difícil posible) ----------

  // Automatiza todo después de generar:
  // - entrance/exit en pared exterior
  // - start/end internos
  // - intenta que start/end sea lo más lejos posible (dificultad)
  // - en mapas normales: exacto por BFS doble
  // - en titánico: heurística (muestreo + BFS acotado)
  autoPlaceGoals({
    markCells = true,
    allowSameAsEntranceExit = false, // si false: start/end no caen en entrance/exit
    resetBorders = true,
  } = {}) {
    if (!this.map) throw new Error('Genera el laberinto primero con generateMaze().');
    if (resetBorders) this._forceBorderWalls();

    // 1) Elegir entrance/exit en pared exterior (abriendo un hueco a un camino interior)
    const { entrance, exit } = this._pickEntranceExitOnBorder();
    this.meta.entrance = entrance;
    this.meta.exit = exit;

    // 2) Elegir start/end internos (lo más lejos posible)
    let pair;
    if (!this.titanic) {
      pair = this._pickHardestInternalPairExact({ avoid: new Set([key(entrance), key(exit)]) });
    } else {
      pair = this._pickHardestInternalPairTitanic({
        avoid: new Set([key(entrance), key(exit)]),
        maxSteps: this.maxBfsStepsTitanic
      });
    }

    let { start, end } = pair;

    // Regla opcional: permitir que start/end puedan ser cualquiera, incluso cerca de borde.
    // Ya son internos “caminables”. Si quieres evitar borde, lo puedes filtrar.
    if (!allowSameAsEntranceExit) {
      if (sameCell(start, entrance) || sameCell(start, exit)) start = this._findNearestOpenNotIn(new Set([key(entrance), key(exit), key(end)]), start);
      if (sameCell(end, entrance) || sameCell(end, exit)) end = this._findNearestOpenNotIn(new Set([key(entrance), key(exit), key(start)]), end);
    }

    this.meta.start = start;
    this.meta.end = end;

    if (markCells) {
      this._set(entrance.x, entrance.y, CELL.ENTRANCE);
      this._set(exit.x, exit.y, CELL.EXIT);
      this._set(start.x, start.y, CELL.START);
      this._set(end.x, end.y, CELL.END);
    }

    return { ...this.meta };
  }

  clearGoalMarkers({ keepMeta = false } = {}) {
    if (!this.map) return;
    const size = this.width * this.height;
    for (let i = 0; i < size; i++) {
      const v = this.map[i];
      if (v >= CELL.ENTRANCE && v <= CELL.END) this.map[i] = CELL.PATH;
    }
    if (!keepMeta && this.meta) {
      this.meta.entrance = null;
      this.meta.exit = null;
      this.meta.start = null;
      this.meta.end = null;
    }
  }

  regenerateBorders() {
    if (!this.map) return;
    this._forceBorderWalls();
  }

  autoPlaceEntranceExit({ markCells = true, resetBorders = true } = {}) {
    if (!this.map) throw new Error('Genera el laberinto primero con generateMaze().');
    if (resetBorders) this._forceBorderWalls();
    const { entrance, exit } = this._pickEntranceExitOnBorder();
    this.meta.entrance = entrance;
    this.meta.exit = exit;
    if (markCells) {
      this._set(entrance.x, entrance.y, CELL.ENTRANCE);
      this._set(exit.x, exit.y, CELL.EXIT);
    }
    return { entrance, exit };
  }

  autoPlaceStartEnd({
    markCells = true,
    allowSameAsEntranceExit = false,
  } = {}) {
    if (!this.map) throw new Error('Genera el laberinto primero con generateMaze().');
    const avoid = new Set();
    if (!allowSameAsEntranceExit) {
      if (this.meta.entrance) avoid.add(key(this.meta.entrance));
      if (this.meta.exit) avoid.add(key(this.meta.exit));
    }

    let pair;
    if (!this.titanic) {
      pair = this._pickHardestInternalPairExact({ avoid });
    } else {
      pair = this._pickHardestInternalPairTitanic({
        avoid,
        maxSteps: this.maxBfsStepsTitanic
      });
    }

    let { start, end } = pair;
    if (!allowSameAsEntranceExit) {
      if (this.meta.entrance && (sameCell(start, this.meta.entrance) || sameCell(start, this.meta.exit))) {
        start = this._findNearestOpenNotIn(new Set([key(this.meta.entrance), key(this.meta.exit), key(end)]), start);
      }
      if (this.meta.exit && (sameCell(end, this.meta.entrance) || sameCell(end, this.meta.exit))) {
        end = this._findNearestOpenNotIn(new Set([key(this.meta.entrance), key(this.meta.exit), key(start)]), end);
      }
    }

    this.meta.start = start;
    this.meta.end = end;

    if (markCells) {
      this._set(start.x, start.y, CELL.START);
      this._set(end.x, end.y, CELL.END);
    }

    return { start, end };
  }

  // Manual: establecer entrance/exit (en pared) y start/end (interno)
  setGoals({ entrance, exit, start, end }, { markCells = true } = {}) {
    if (!this.map) throw new Error('Genera el laberinto primero con generateMaze().');

    if (entrance) assertBorderCell(entrance, this.width, this.height);
    if (exit) assertBorderCell(exit, this.width, this.height);
    if (start) assertInBounds(start, this.width, this.height);
    if (end) assertInBounds(end, this.width, this.height);

    this.meta.entrance = entrance ?? this.meta.entrance;
    this.meta.exit = exit ?? this.meta.exit;
    this.meta.start = start ?? this.meta.start;
    this.meta.end = end ?? this.meta.end;

    if (markCells) {
      if (this.meta.entrance) this._set(this.meta.entrance.x, this.meta.entrance.y, CELL.ENTRANCE);
      if (this.meta.exit) this._set(this.meta.exit.x, this.meta.exit.y, CELL.EXIT);
      if (this.meta.start) this._set(this.meta.start.x, this.meta.start.y, CELL.START);
      if (this.meta.end) this._set(this.meta.end.x, this.meta.end.y, CELL.END);
    }

    return { ...this.meta };
  }

  // ---------- Internals ----------

  _allocMap(fillValue = CELL.WALL) {
    const size = this.width * this.height;
    this.map = new Uint8Array(size);
    this.map.fill(fillValue);
  }

  _idx(x, y) { return y * this.width + x; }
  _get(x, y) { return this.map[this._idx(x, y)]; }
  _set(x, y, v) { this.map[this._idx(x, y)] = v; }

  _forceBorderWalls() {
    const w = this.width, h = this.height;
    for (let x = 0; x < w; x++) {
      this._set(x, 0, CELL.WALL);
      this._set(x, h - 1, CELL.WALL);
    }
    for (let y = 0; y < h; y++) {
      this._set(0, y, CELL.WALL);
      this._set(w - 1, y, CELL.WALL);
    }
  }

  _openBorderPaths() {
    const w = this.width, h = this.height;
    for (let x = 0; x < w; x++) {
      if (this._get(x, 0) === CELL.WALL) this._set(x, 0, CELL.PATH);
      if (this._get(x, h - 1) === CELL.WALL) this._set(x, h - 1, CELL.PATH);
    }
    for (let y = 0; y < h; y++) {
      if (this._get(0, y) === CELL.WALL) this._set(0, y, CELL.PATH);
      if (this._get(w - 1, y) === CELL.WALL) this._set(w - 1, y, CELL.PATH);
    }
  }

  _extendPathsToBorder() {
    const w = this.width, h = this.height;
    if (w < 2 || h < 2) return;
    for (let x = 0; x < w; x++) {
      if (this._get(x, 1) !== CELL.WALL && this._get(x, 0) === CELL.WALL) {
        this._set(x, 0, CELL.PATH);
      }
      if (this._get(x, h - 2) !== CELL.WALL && this._get(x, h - 1) === CELL.WALL) {
        this._set(x, h - 1, CELL.PATH);
      }
    }
    for (let y = 0; y < h; y++) {
      if (this._get(1, y) !== CELL.WALL && this._get(0, y) === CELL.WALL) {
        this._set(0, y, CELL.PATH);
      }
      if (this._get(w - 2, y) !== CELL.WALL && this._get(w - 1, y) === CELL.WALL) {
        this._set(w - 1, y, CELL.PATH);
      }
    }
  }

  _removeDeadEnds({ protectGoals = true, maxPasses = 64 } = {}) {
    if (!this.map) return;
    const w = this.width;
    const h = this.height;
    const map = this.map;
    const total = w * h;
    const limit = Math.max(1, Math.min(maxPasses | 0, total));

    const isProtected = (v) => protectGoals && v !== CELL.WALL && v !== CELL.PATH;
    const inBounds = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    let pass = 0;
    let changed = true;
    while (changed && pass < limit) {
      changed = false;
      pass++;
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          const v = map[idx];
          if (v === CELL.WALL || isProtected(v)) continue;

          let openCount = 0;
          for (let d = 0; d < 4; d++) {
            const nx = x + dirs[d].dx;
            const ny = y + dirs[d].dy;
            if (map[ny * w + nx] !== CELL.WALL) openCount++;
          }
          if (openCount > 1) continue;

          const candidates = [];
          for (let d = 0; d < 4; d++) {
            const dx = dirs[d].dx;
            const dy = dirs[d].dy;
            const wx = x + dx;
            const wy = y + dy;
            if (!inBounds(wx, wy)) continue;
            const wallIdx = wy * w + wx;
            if (map[wallIdx] !== CELL.WALL) continue;
            const tx = x + dx * 2;
            const ty = y + dy * 2;
            if (!inBounds(tx, ty)) continue;
            const targetIdx = ty * w + tx;
            if (map[targetIdx] !== CELL.WALL) {
              candidates.push(wallIdx);
            }
          }

          if (!candidates.length) continue;
          const pick = candidates[(this.rand() * candidates.length) | 0];
          map[pick] = CELL.PATH;
          changed = true;
        }
      }
    }
  }

  _carveIterativeDFS(startX, startY) {
    const w = this.width, h = this.height;
    const stack = new Int32Array(w * h);
    let sp = 0;

    const push = (x, y) => { stack[sp++] = (y << 16) | x; };
    const pop = () => stack[--sp];

    this._set(startX, startY, 0);
    push(startX, startY);

    const dirs = new Int32Array([0, -2, 2, 0, 0, 2, -2, 0]); // (dx,dy)*4
    const order = new Int8Array(4);

    while (sp > 0) {
      const packed = pop();
      const x = packed & 0xffff;
      const y = packed >>> 16;

      // mezclar direcciones con Fisher–Yates usando RNG seed
      // (sin crear arrays nuevos cada vez)
      order[0] = 0; order[1] = 1; order[2] = 2; order[3] = 3;
      shuffle4(order, this.rand);

      let carvedAny = false;

      for (let k = 0; k < 4; k++) {
        const di = order[k] << 1;
        const dx = dirs[di], dy = dirs[di + 1];
        const nx = x + dx, ny = y + dy;

        if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;
        if (this._get(nx, ny) !== 1) continue;

        // romper muro intermedio
        this._set(x + (dx >> 1), y + (dy >> 1), 0);
        this._set(nx, ny, 0);

        // DFS: reinsertar actual para seguir explorando luego y bajar a vecino
        push(x, y);
        push(nx, ny);
        carvedAny = true;
        break;
      }

      // si no carvedAny: backtrack natural
    }
  }

  _pickEntranceExitOnBorder() {
    // Elegimos dos aperturas en la pared exterior que conecten a un camino interno.
    // Preferimos puntos alejados entre sí en el perímetro.
    const candidates = this._borderOpenCandidates();

    if (candidates.length < 2) {
      // fallback extremo: abrir forzosamente dos lugares
      const a = { x: 0, y: 1 };
      const b = { x: this.width - 1, y: this.height - 2 };
      this._set(a.x, a.y, 0);
      this._set(1, 1, 0);
      this._set(b.x, b.y, 0);
      this._set(this.width - 2, this.height - 2, 0);
      return { entrance: a, exit: b };
    }

    // Escoge uno al azar y el otro el más lejos en distancia Manhattan sobre coordenadas
    const entrance = candidates[(this.rand() * candidates.length) | 0];
    let exit = candidates[0];
    let best = -1;
    for (const c of candidates) {
      const d = Math.abs(c.x - entrance.x) + Math.abs(c.y - entrance.y);
      if (d > best) { best = d; exit = c; }
    }

    // Asegurar que sean huecos (0) en el mapa (abriendo el borde y el adyacente interior)
    this._openBorderCell(entrance.x, entrance.y);
    this._openBorderCell(exit.x, exit.y);

    return { entrance, exit };
  }

  _openBorderCell(x, y) {
    // abre (x,y) y su vecino interior inmediato si es muro
    this._set(x, y, 0);
    const inward = inwardNeighbor(x, y, this.width, this.height);
    if (inward) this._set(inward.x, inward.y, 0);
  }

  _borderOpenCandidates() {
    // candidato: celda en borde que, abriéndola, conecta con un camino interior o lo puede hacer con 1 paso
    const w = this.width, h = this.height;
    const out = [];

    const test = (x, y) => {
      const inward = inwardNeighbor(x, y, w, h);
      if (!inward) return;
      const v = this._get(inward.x, inward.y);
      // si adentro ya es camino (0) o algún marcador, sirve
      if (v !== 1) out.push({ x, y });
    };

    for (let x = 1; x < w - 1; x++) { test(x, 0); test(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { test(0, y); test(w - 1, y); }

    // si no hay, intentamos permitir abrir aunque el inward sea muro pero con otro inward cercano
    if (out.length === 0) {
      const test2 = (x, y) => {
        const inward = inwardNeighbor(x, y, w, h);
        if (!inward) return;
        // mira 4 vecinos del inward a 1 paso
        const n = this._neighbors4(inward.x, inward.y);
        for (const p of n) {
          if (this._inBounds(p.x, p.y) && this._get(p.x, p.y) === 0) {
            out.push({ x, y });
            return;
          }
        }
      };
      for (let x = 1; x < w - 1; x++) { test2(x, 0); test2(x, h - 1); }
      for (let y = 1; y < h - 1; y++) { test2(0, y); test2(w - 1, y); }
    }

    return out;
  }

  _inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  _neighbors4(x, y) {
    return [
      { x: x + 1, y }, { x: x - 1, y },
      { x, y: y + 1 }, { x, y: y - 1 },
    ];
  }

  _pickHardestInternalPairExact({ avoid = new Set() } = {}) {
    // Doble BFS (aprox. al diámetro real del grafo del laberinto, suele ser muy bueno):
    // 1) toma un punto caminable P
    // 2) BFS desde P → encuentra A (más lejos)
    // 3) BFS desde A → encuentra B (más lejos) => (A,B) grande
    const p = this._findAnyOpenNotIn(avoid) ?? this._findAnyOpenNotIn(new Set());
    const a = bfsFarthest(this, p, { avoid });
    const b = bfsFarthest(this, a.cell, { avoid });
    return { start: a.cell, end: b.cell, distance: b.dist };
  }

  _pickHardestInternalPairTitanic({ avoid = new Set(), maxSteps } = {}) {
    // Heurística para no matar CPU/RAM:
    // - muestrea varios puntos caminables (en rejilla por chunks)
    // - elige el que produzca mayor BFS (acotado)
    // - aplica doble BFS con límites
    const samples = this._sampleOpenCellsByGrid(avoid);
    if (samples.length === 0) {
      const fallback = this._findAnyOpenNotIn(new Set()) ?? { x: 1, y: 1 };
      return { start: fallback, end: fallback, distance: 0 };
    }

    let bestPair = null;
    let bestDist = -1;

    // primero encuentra un buen A
    for (const s of samples) {
      const a = bfsFarthest(this, s, { avoid, maxSteps });
      const b = bfsFarthest(this, a.cell, { avoid, maxSteps });
      if (b.dist > bestDist) {
        bestDist = b.dist;
        bestPair = { start: a.cell, end: b.cell, distance: b.dist };
      }
    }
    return bestPair ?? { start: samples[0], end: samples[0], distance: 0 };
  }

  _sampleOpenCellsByGrid(avoid) {
    // muestreo: revisa puntos cada chunkSize/2 y busca el caminable más cercano
    const step = Math.max(16, (this.titanicChunkSize >> 1));
    const out = [];
    for (let y = 1; y < this.height - 1; y += step) {
      for (let x = 1; x < this.width - 1; x += step) {
        const c = this._findNearestOpenNotIn(avoid, { x, y }, 64);
        if (c) out.push(c);
        if (out.length >= 24) return out; // límite razonable
      }
    }
    // fallback extra aleatorio si quedó corto
    while (out.length < 16) {
      const x = 1 + ((this.rand() * (this.width - 2)) | 0);
      const y = 1 + ((this.rand() * (this.height - 2)) | 0);
      const c = this._findNearestOpenNotIn(avoid, { x, y }, 64);
      if (c) out.push(c);
      else break;
    }
    return out;
  }

  _findAnyOpenNotIn(avoid) {
    const avoidHas = avoid && avoid.size > 0;
    // intenta aleatorio primero
    for (let i = 0; i < 2000; i++) {
      const x = 1 + ((this.rand() * (this.width - 2)) | 0);
      const y = 1 + ((this.rand() * (this.height - 2)) | 0);
      const v = this._get(x, y);
      if (v !== 1 && (!avoidHas || !avoid.has(keyXY(x, y)))) return { x, y };
    }
    // scan
    for (let y = 1; y < this.height - 1; y++) {
      const off = y * this.width;
      for (let x = 1; x < this.width - 1; x++) {
        const v = this.map[off + x];
        if (v !== 1 && (!avoidHas || !avoid.has(keyXY(x, y)))) return { x, y };
      }
    }
    return null;
  }

  _findNearestOpenNotIn(avoid, from, maxRadius = 128) {
    const avoidHas = avoid && avoid.size > 0;
    // búsqueda en espiral/cuadrados concéntricos (rápida y simple)
    const fx = clamp(from.x | 0, 0, this.width - 1);
    const fy = clamp(from.y | 0, 0, this.height - 1);
    if (this._get(fx, fy) !== 1 && (!avoidHas || !avoid.has(keyXY(fx, fy)))) return { x: fx, y: fy };

    for (let r = 1; r <= maxRadius; r++) {
      const x0 = clamp(fx - r, 0, this.width - 1);
      const x1 = clamp(fx + r, 0, this.width - 1);
      const y0 = clamp(fy - r, 0, this.height - 1);
      const y1 = clamp(fy + r, 0, this.height - 1);

      // bordes del cuadrado
      for (let x = x0; x <= x1; x++) {
        if (this._cellOk(x, y0, avoid)) return { x, y: y0 };
        if (this._cellOk(x, y1, avoid)) return { x, y: y1 };
      }
      for (let y = y0; y <= y1; y++) {
        if (this._cellOk(x0, y, avoid)) return { x: x0, y };
        if (this._cellOk(x1, y, avoid)) return { x: x1, y };
      }
    }
    return null;
  }

  _cellOk(x, y, avoid) {
    const v = this._get(x, y);
    return v !== 1 && !avoid.has(keyXY(x, y));
  }
}


// -------------------- BFS helpers (iterativo, eficiente) --------------------

const DENSE_BFS_MAX_CELLS = 5_000_000;

function bfsFarthest(gen, start, { avoid = new Set(), maxSteps = Infinity } = {}) {
  const w = gen.width, h = gen.height;
  if (!start) return { cell: { x: 1, y: 1 }, dist: 0 };

  const avoidHas = avoid && avoid.size > 0;
  if (avoidHas && avoid.has(key(start))) {
    // si start esta prohibido, intenta moverlo
    const alt = gen._findAnyOpenNotIn(avoid);
    if (!alt) return { cell: start, dist: 0 };
    start = alt;
  }

  const size = w * h;
  const useSparse = !Number.isFinite(size)
    || size > DENSE_BFS_MAX_CELLS
    || (Number.isFinite(maxSteps) && maxSteps < size);

  return useSparse
    ? bfsFarthestSparse(gen, start, { avoid, maxSteps })
    : bfsFarthestDense(gen, start, { avoid, maxSteps });
}

function bfsFarthestDense(gen, start, { avoid = new Set(), maxSteps = Infinity } = {}) {
  const w = gen.width, h = gen.height;
  const size = w * h;

  const visited = new Uint8Array(size);
  const qx = new Int32Array(size);
  const qy = new Int32Array(size);
  const qd = new Int32Array(size);

  let head = 0, tail = 0;
  qx[tail] = start.x; qy[tail] = start.y; qd[tail] = 0; tail++;
  visited[start.y * w + start.x] = 1;

  let farX = start.x, farY = start.y, farDist = 0;
  const avoidHas = avoid && avoid.size > 0;
  let steps = 0;

  while (head < tail && steps < maxSteps) {
    const x = qx[head], y = qy[head], d = qd[head]; head++;
    steps++;

    if (d > farDist) { farDist = d; farX = x; farY = y; }

    const nd = d + 1;

    let nx = x + 1;
    if (nx < w) {
      const idx = y * w + nx;
      if (!visited[idx] && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(nx, y)))) {
        visited[idx] = 1; qx[tail] = nx; qy[tail] = y; qd[tail] = nd; tail++;
      }
    }

    nx = x - 1;
    if (nx >= 0) {
      const idx = y * w + nx;
      if (!visited[idx] && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(nx, y)))) {
        visited[idx] = 1; qx[tail] = nx; qy[tail] = y; qd[tail] = nd; tail++;
      }
    }

    let ny = y + 1;
    if (ny < h) {
      const idx = ny * w + x;
      if (!visited[idx] && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(x, ny)))) {
        visited[idx] = 1; qx[tail] = x; qy[tail] = ny; qd[tail] = nd; tail++;
      }
    }

    ny = y - 1;
    if (ny >= 0) {
      const idx = ny * w + x;
      if (!visited[idx] && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(x, ny)))) {
        visited[idx] = 1; qx[tail] = x; qy[tail] = ny; qd[tail] = nd; tail++;
      }
    }
  }

  return { cell: { x: farX, y: farY }, dist: farDist };
}

function bfsFarthestSparse(gen, start, { avoid = new Set(), maxSteps = Infinity } = {}) {
  const w = gen.width, h = gen.height;
  const avoidHas = avoid && avoid.size > 0;

  const hardLimit = Number.isFinite(maxSteps) ? Math.max(1, (maxSteps | 0)) + 8 : 1_000_000;
  const qx = new Int32Array(hardLimit);
  const qy = new Int32Array(hardLimit);
  const qd = new Int32Array(hardLimit);
  const visited = new Set();

  let head = 0, tail = 0;
  qx[tail] = start.x; qy[tail] = start.y; qd[tail] = 0; tail++;
  visited.add(start.y * w + start.x);

  let farX = start.x, farY = start.y, farDist = 0;
  let steps = 0;

  while (head < tail && steps < maxSteps) {
    const x = qx[head], y = qy[head], d = qd[head]; head++;
    steps++;

    if (d > farDist) { farDist = d; farX = x; farY = y; }

    if (tail + 4 >= hardLimit) break;

    const nd = d + 1;

    let nx = x + 1;
    if (nx < w) {
      const idx = y * w + nx;
      if (!visited.has(idx) && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(nx, y)))) {
        visited.add(idx); qx[tail] = nx; qy[tail] = y; qd[tail] = nd; tail++;
      }
    }

    nx = x - 1;
    if (nx >= 0) {
      const idx = y * w + nx;
      if (!visited.has(idx) && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(nx, y)))) {
        visited.add(idx); qx[tail] = nx; qy[tail] = y; qd[tail] = nd; tail++;
      }
    }

    let ny = y + 1;
    if (ny < h) {
      const idx = ny * w + x;
      if (!visited.has(idx) && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(x, ny)))) {
        visited.add(idx); qx[tail] = x; qy[tail] = ny; qd[tail] = nd; tail++;
      }
    }

    ny = y - 1;
    if (ny >= 0) {
      const idx = ny * w + x;
      if (!visited.has(idx) && gen.map[idx] !== 1 && (!avoidHas || !avoid.has(keyXY(x, ny)))) {
        visited.add(idx); qx[tail] = x; qy[tail] = ny; qd[tail] = nd; tail++;
      }
    }
  }

  return { cell: { x: farX, y: farY }, dist: farDist };
}

// -------------------- Endless (por chunks) --------------------
// Esto NO usa el MapGenerator finito. Es un generador infinito por coordenadas.
// Cada chunk es un maze pequeño. Las "puertas" entre chunks se deciden de forma determinista
// usando seed+coords y se reflejan en ambos lados (coherencia).
export class EndlessMaze {
  constructor({
    chunkSize = 65,     // ideal impar (maze), ej 65x65
    seed = 12345,
    wall = 1,
    path = 0,
    cacheLimit = 256,
    loopChance = 0.06,
    roomAttempts = 6,
    roomMinSize = 3,
    roomMaxSize = 9,
    roomTemplate = null,
    roomTemplateSize = 16,
    forceRoomTemplate = false,
    ensureDoors = true,
  } = {}) {
    const seedInfo = normalizeSeed(seed);
    this.seed = seedInfo.seed;
    this.seedSource = seedInfo.source;
    this.chunkSize = normalizeOdd(Math.max(9, chunkSize | 0)); // >=9 e impar
    // stride = chunkSize - 1 para evitar doble pared entre chunks (borde compartido)
    this.chunkStride = Math.max(2, this.chunkSize - 1);
    this.wall = wall;
    this.path = path;
    this.cacheLimit = (cacheLimit === Infinity || cacheLimit == null)
      ? Infinity
      : Math.max(8, cacheLimit | 0);
    this.cache = new Map(); // LRU simple
    this.loopChance = clamp(Number(loopChance) || 0, 0, 1);
    this.roomAttempts = Math.max(0, roomAttempts | 0);
    this.roomMinSize = Math.max(1, roomMinSize | 0);
    this.roomMaxSize = Math.max(this.roomMinSize, roomMaxSize | 0);
    this.roomTemplateSize = Math.max(2, roomTemplateSize | 0);
    this.roomTemplate = (roomTemplate == null)
      ? null
      : normalizeRoomTemplate(roomTemplate, this.roomTemplateSize);
    this.roomTemplateRotations = this.roomTemplate
      ? buildTemplateRotations(this.roomTemplate, this.roomTemplateSize)
      : null;
    this.forceRoomTemplate = !!forceRoomTemplate;
    this.ensureDoors = !!ensureDoors;
  }

  reseed(seed = null) {
    const seedInfo = normalizeSeed(seed);
    this.seed = seedInfo.seed;
    this.seedSource = seedInfo.source;
    this.cache.clear();
    return this.seed;
  }

  // Obtén celda global (x,y) generando chunk bajo demanda.
  // x,y pueden ser negativos también.
  getCell(x, y) {
    const cs = this.chunkSize;
    const stride = this.chunkStride;
    const cx = floorDiv(x, stride);
    const cy = floorDiv(y, stride);
    const lx = mod(x, stride);
    const ly = mod(y, stride);

    const chunk = this._getChunk(cx, cy);
    return chunk[ly * cs + lx];
  }

  // Obtén un viewport (matriz 2D) sin generar “el mundo entero”.
  getViewport(x0, y0, w, h) {
    const out = Array(h);
    for (let yy = 0; yy < h; yy++) {
      const row = new Array(w);
      for (let xx = 0; xx < w; xx++) {
        row[xx] = this.getCell(x0 + xx, y0 + yy);
      }
      out[yy] = row;
    }
    return out;
  }

  renderViewport(x0, y0, w, h, { wall = '██', path = '  ' } = {}) {
    const lines = [];
    for (let yy = 0; yy < h; yy++) {
      let s = '';
      for (let xx = 0; xx < w; xx++) {
        const v = this.getCell(x0 + xx, y0 + yy);
        s += (v === this.wall) ? wall : path;
      }
      lines.push(s);
    }
    return lines.join('\n');
  }

  _getChunk(cx, cy) {
    const k = `${cx},${cy}`;
    const cached = this.cache.get(k);
    if (cached) {
      if (this.cacheLimit !== Infinity) {
        this.cache.delete(k);
        this.cache.set(k, cached);
      }
      return cached;
    }

    const cs = this.chunkSize;
    const map = new Uint8Array(cs * cs);
    map.fill(this.wall);

    // puertas deterministas en bordes (N,E,S,W)
    // se sincronizan: puerta E de (cx,cy) == puerta W de (cx+1,cy)
    const doors = this._doorsForChunk(cx, cy);

    // carve maze dentro del chunk
    const rng = mulberry32(hash2(this.seed, cx, cy));

    // borde muros
    for (let x = 0; x < cs; x++) { map[x] = this.wall; map[(cs - 1) * cs + x] = this.wall; }
    for (let y = 0; y < cs; y++) { map[y * cs] = this.wall; map[y * cs + (cs - 1)] = this.wall; }

    const set = (x, y, v) => { map[y * cs + x] = v; };
    const get = (x, y) => map[y * cs + x];

    // abrir puertas en borde y su inward
    const openDoor = (edge, pos) => {
      if (edge === 'N') { set(pos, 0, this.path); set(pos, 1, this.path); }
      if (edge === 'S') { set(pos, cs - 1, this.path); set(pos, cs - 2, this.path); }
      if (edge === 'W') { set(0, pos, this.path); set(1, pos, this.path); }
      if (edge === 'E') { set(cs - 1, pos, this.path); set(cs - 2, pos, this.path); }
    };

    if (doors.N != null) openDoor('N', doors.N);
    if (doors.S != null) openDoor('S', doors.S);
    if (doors.W != null) openDoor('W', doors.W);
    if (doors.E != null) openDoor('E', doors.E);

    // start interno impar
    const sx = clampOdd(1 + ((rng() * (cs - 2)) | 0), 1, cs - 2);
    const sy = clampOdd(1 + ((rng() * (cs - 2)) | 0), 1, cs - 2);

    // DFS iterativo dentro del chunk
    set(sx, sy, this.path);
    const stack = new Int32Array(cs * cs);
    let sp = 0;
    stack[sp++] = (sy << 16) | sx;

    const dirs = new Int32Array([0, -2, 2, 0, 0, 2, -2, 0]);
    const order = new Int8Array(4);
    while (sp > 0) {
      const packed = stack[--sp];
      const x = packed & 0xffff;
      const y = packed >>> 16;

      order[0] = 0; order[1] = 1; order[2] = 2; order[3] = 3;
      shuffle4(order, rng);

      for (let k2 = 0; k2 < 4; k2++) {
        const di = order[k2] << 1;
        const dx = dirs[di], dy = dirs[di + 1];
        const nx = x + dx, ny = y + dy;

        if (nx <= 0 || nx >= cs - 1 || ny <= 0 || ny >= cs - 1) continue;
        if (get(nx, ny) !== this.wall) continue;

        set(x + (dx >> 1), y + (dy >> 1), this.path);
        set(nx, ny, this.path);

        stack[sp++] = (y << 16) | x;
        stack[sp++] = (ny << 16) | nx;
        break;
      }
    }

    this._carveRooms(map, rng);
    this._addLoops(map, rng);
    this._ensureDoorConnectivity(map, doors);

    this.cache.set(k, map);
    this._trimCache();
    // Si quieres: aquí puedes meter LRU (borrar chunks viejos)
    return map;
  }

  _carveRooms(map, rng) {
    const attempts = this.roomAttempts;
    if (!attempts) return;
    const cs = this.chunkSize;
    const templateRotations = this.roomTemplateRotations;
    if (this.roomTemplate !== null) {
      if (templateRotations && templateRotations.length) {
        applyTemplateRooms({
          map,
          width: cs,
          height: cs,
          attempts,
          rotations: templateRotations,
          pathValue: this.path,
          wallValue: this.wall,
          forceTemplate: this.forceRoomTemplate,
          rand: rng,
        });
      }
      return;
    }

    applyRectRooms({
      map,
      width: cs,
      height: cs,
      attempts,
      minSize: this.roomMinSize,
      maxSize: this.roomMaxSize,
      pathValue: this.path,
      rand: rng,
    });
  }

  _addLoops(map, rng) {
    const chance = this.loopChance;
    if (chance <= 0) return;
    const cs = this.chunkSize;
    for (let y = 1; y < cs - 1; y++) {
      const row = y * cs;
      for (let x = 1; x < cs - 1; x++) {
        const idx = row + x;
        if (map[idx] !== this.wall) continue;
        const left = map[idx - 1] !== this.wall;
        const right = map[idx + 1] !== this.wall;
        const up = map[idx - cs] !== this.wall;
        const down = map[idx + cs] !== this.wall;
        if ((left && right) || (up && down)) {
          if (rng() < chance) map[idx] = this.path;
        }
      }
    }
  }

  _trimCache() {
    if (this.cacheLimit === Infinity) return;
    while (this.cache.size > this.cacheLimit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  _ensureDoorConnectivity(map, doors) {
    const cs = this.chunkSize;
    const w = cs, h = cs;
    const wall = this.wall;
    const path = this.path;

    const connectFrom = (sx, sy) => {
      if (sx <= 0 || sy <= 0 || sx >= w - 1 || sy >= h - 1) return;
      const startIdx = sy * w + sx;
      map[startIdx] = path;

      const max = w * h;
      const q = new Int32Array(max);
      const parent = new Int32Array(max);
      for (let i = 0; i < max; i++) parent[i] = -1;
      let head = 0, tail = 0;
      q[tail++] = startIdx;
      parent[startIdx] = startIdx;

      let goal = -1;
      while (head < tail) {
        const idx = q[head++];
        if (idx !== startIdx && map[idx] !== wall) { goal = idx; break; }
        const x = idx % w;
        const y = (idx / w) | 0;

        const nx1 = x + 1;
        if (nx1 < w - 1) {
          const nidx = idx + 1;
          if (parent[nidx] === -1 && nx1 > 0) { parent[nidx] = idx; q[tail++] = nidx; }
        }
        const nx2 = x - 1;
        if (nx2 > 0) {
          const nidx = idx - 1;
          if (parent[nidx] === -1) { parent[nidx] = idx; q[tail++] = nidx; }
        }
        const ny1 = y + 1;
        if (ny1 < h - 1) {
          const nidx = idx + w;
          if (parent[nidx] === -1) { parent[nidx] = idx; q[tail++] = nidx; }
        }
        const ny2 = y - 1;
        if (ny2 > 0) {
          const nidx = idx - w;
          if (parent[nidx] === -1) { parent[nidx] = idx; q[tail++] = nidx; }
        }
      }

      if (goal !== -1) {
        let cur = goal;
        while (cur !== startIdx) {
          map[cur] = path;
          cur = parent[cur];
        }
        map[startIdx] = path;
      }
    };

    if (doors.N != null) connectFrom(doors.N, 1);
    if (doors.S != null) connectFrom(doors.S, h - 2);
    if (doors.W != null) connectFrom(1, doors.W);
    if (doors.E != null) connectFrom(w - 2, doors.E);
  }

  _doorsForChunk(cx, cy) {
    const cs = this.chunkSize;

    const doorPos = (h) => {
      // devuelve una posición impar en [1, cs-2], o null para “sin puerta”
      // probabilidad de puerta ~70% (o forzada si ensureDoors)
      const r = mulberry32(h)();
      if (!this.ensureDoors && r < 0.30) return null;
      const p = 1 + (((mulberry32(h ^ 0x9e3779b9)()) * (cs - 2)) | 0);
      return clampOdd(p, 1, cs - 2);
    };

    // Para sincronizar puertas, definimos hashes por “borde compartido”
    const hN = hash3(this.seed, cx, cy, 1);           // borde N del chunk actual
    const hS = hash3(this.seed, cx, cy + 1, 1);       // borde N del chunk de abajo == S actual
    const hW = hash3(this.seed, cx, cy, 2);           // borde W actual
    const hE = hash3(this.seed, cx + 1, cy, 2);       // borde W del chunk derecho == E actual

    return {
      N: doorPos(hN),
      S: doorPos(hS),
      W: doorPos(hW),
      E: doorPos(hE),
    };
  }
}


// -------------------- Utilidades --------------------

function normalizeMazeSize(w, h) {
  w = Math.max(5, w | 0);
  h = Math.max(5, h | 0);
  // los laberintos DFS por celdas “impares” funcionan mejor con dimensiones impares
  w = normalizeOdd(w);
  h = normalizeOdd(h);
  return { width: w, height: h };
}

function normalizeOdd(n) { return (n % 2 === 0) ? n + 1 : n; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function clampOdd(v, lo, hi) {
  v = clamp(v, lo, hi);
  if ((v & 1) === 0) v = (v + 1 <= hi) ? v + 1 : v - 1;
  return clamp(v, lo, hi);
}

function shuffle4(arr, rand) {
  for (let i = 3; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function inwardNeighbor(x, y, w, h) {
  // devuelve el vecino que apunta hacia adentro del mapa desde un borde
  if (y === 0) return { x, y: 1 };
  if (y === h - 1) return { x, y: h - 2 };
  if (x === 0) return { x: 1, y };
  if (x === w - 1) return { x: w - 2, y };
  return null;
}

function keyXY(x, y) { return `${x},${y}`; }
function key(p) { return `${p.x},${p.y}`; }
function sameCell(a, b) { return a && b && a.x === b.x && a.y === b.y; }

function assertBorderCell(p, w, h) {
  assertInBounds(p, w, h);
  const isBorder = (p.x === 0 || p.x === w - 1 || p.y === 0 || p.y === h - 1);
  if (!isBorder) throw new Error(`La celda (${p.x},${p.y}) no está en la pared exterior.`);
}
function assertInBounds(p, w, h) {
  if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) {
    throw new Error(`Fuera de rango: (${p.x},${p.y}) en mapa ${w}x${h}`);
  }
}

function randomSeed() {
  return (Date.now() ^ (Math.random() * 2 ** 31)) | 0;
}

function normalizeSeed(seed) {
  if (seed == null || seed === '') {
    return { seed: randomSeed(), source: 'random' };
  }
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return { seed: seed | 0, source: 'number' };
  }
  if (typeof seed === 'string') {
    const t = seed.trim();
    if (t === '') return { seed: randomSeed(), source: 'random' };
    if (/^-?\d+(\.\d+)?$/.test(t)) return { seed: (Number(t) | 0), source: 'string:number' };
    return { seed: hashString(t), source: 'string:hash' };
  }
  return { seed: randomSeed(), source: 'random' };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

// RNG determinista
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Hashes rápidos para endless
function hash2(seed, a, b) {
  let x = seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x | 0;
}
function hash3(seed, a, b, c) {
  return hash2(hash2(seed, a, b), c, 0x27d4eb2d);
}

function normalizeRoomTemplate(template, size) {
  if (!template) return null;
  const len = size * size;
  const src = (Array.isArray(template) || ArrayBuffer.isView(template)) ? template : null;
  if (!src) return null;

  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const raw = Number(src[i]);
    const v = Number.isFinite(raw) ? raw : 0;
    out[i] = v <= 0 ? 0 : (v >= 3 ? 3 : (v | 0));
  }
  return out;
}

function buildTemplateRotations(template, size) {
  const rotations = [];
  const seen = new Set();

  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const tv = template[row + x];
        if (!tv) continue;
        let rx = x, ry = y;
        if (r === 1) { rx = size - 1 - y; ry = x; }
        else if (r === 2) { rx = size - 1 - x; ry = size - 1 - y; }
        else if (r === 3) { rx = y; ry = size - 1 - x; }
        cells.push({ x: rx, y: ry, v: tv });
      }
    }

    if (!cells.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of cells) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }

    const norm = cells.map((c) => ({ x: c.x - minX, y: c.y - minY, v: c.v }));
    norm.sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.v - b.v));
    const keyStr = `${maxX - minX + 1}x${maxY - minY + 1}|` + norm.map((c) => `${c.x},${c.y},${c.v}`).join(';');
    if (seen.has(keyStr)) continue;
    seen.add(keyStr);

    rotations.push({
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      cells: norm,
    });
  }

  return rotations;
}

function applyRectRooms({ map, width, height, attempts, minSize, maxSize, pathValue, rand }) {
  if (!attempts) return;
  if (width < 3 || height < 3) return;

  const maxRoom = Math.min(width - 2, height - 2);
  const min = Math.max(1, minSize | 0);
  const max = Math.max(min, maxSize | 0);
  const minSizeClamped = Math.min(maxRoom, min);
  const maxSizeClamped = Math.min(maxRoom, max);
  if (minSizeClamped <= 0 || maxSizeClamped <= 0) return;

  const randInt = (lo, hi) => lo + ((rand() * (hi - lo + 1)) | 0);
  const phi = 0.61803398875;
  let ux = rand();
  let uy = rand();

  for (let i = 0; i < attempts; i++) {
    let rw = randInt(minSizeClamped, maxSizeClamped);
    let rh = randInt(minSizeClamped, maxSizeClamped);

    if ((rw & 1) === 0) rw = (rw + 1 <= maxSizeClamped) ? rw + 1 : rw - 1;
    if ((rh & 1) === 0) rh = (rh + 1 <= maxSizeClamped) ? rh + 1 : rh - 1;

    const maxX = width - 1 - rw;
    const maxY = height - 1 - rh;
    if (maxX < 1 || maxY < 1) continue;

    const minX = 1;
    const minY = 1;
    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    ux = (ux + phi) % 1;
    uy = (uy + (phi * 0.5)) % 1;
    const x0 = minX + Math.floor(ux * rangeX);
    const y0 = minY + Math.floor(uy * rangeY);
    for (let y = y0; y < y0 + rh; y++) {
      map.fill(pathValue, y * width + x0, y * width + x0 + rw);
    }
  }
}

function applyTemplateRooms({ map, width, height, attempts, rotations, pathValue, wallValue, forceTemplate, rand }) {
  if (!attempts || !rotations || !rotations.length) return;
  if (width < 3 || height < 3) return;

  const randInt = (lo, hi) => lo + ((rand() * (hi - lo + 1)) | 0);
  const phi = 0.61803398875;
  let ux = rand();
  let uy = rand();

  for (let i = 0; i < attempts; i++) {
    const rot = rotations[(rand() * rotations.length) | 0];
    const w = rot.w, h = rot.h;
    const maxX = width - 1 - w;
    const maxY = height - 1 - h;
    if (maxX < 1 || maxY < 1) continue;

    const minX = 1;
    const minY = 1;
    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    ux = (ux + phi) % 1;
    uy = (uy + (phi * 0.5)) % 1;
    const x0 = minX + Math.floor(ux * rangeX);
    const y0 = minY + Math.floor(uy * rangeY);
    const entrances = [];

    for (let c = 0; c < rot.cells.length; c++) {
      const cell = rot.cells[c];
      const x = x0 + cell.x;
      const y = y0 + cell.y;
      const idx = y * width + x;
      if (cell.v === 2) {
        if (forceTemplate) map[idx] = wallValue;
      } else {
        map[idx] = pathValue;
        if (cell.v === 3) entrances.push(cell);
      }
    }

    if (entrances.length) {
      for (let e = 0; e < entrances.length; e++) {
        const cell = entrances[e];
        let nx = x0 + cell.x;
        let ny = y0 + cell.y;
        if (cell.x === 0) nx = x0 - 1;
        else if (cell.x === w - 1) nx = x0 + w;
        else if (cell.y === 0) ny = y0 - 1;
        else if (cell.y === h - 1) ny = y0 + h;
        else continue;

        if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
        map[ny * width + nx] = pathValue;
      }
    }
  }
}
// división y módulo para negativos (endless)
function floorDiv(a, b) {
  const q = (a / b) | 0;
  return (a ^ b) < 0 && (a % b) ? q - 1 : q;
}
function mod(a, b) {
  const m = a % b;
  return m < 0 ? m + b : m;
}
