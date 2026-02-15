  /* fue un copia y pega del codigo porque al chile me dio hueva buscar
  
  si despues ves que es mucho menos codigo y sigue el mensaje... 
  se me olvido quitar el mensaje 
  chao 
  */
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
      const CALIB_KEY = 'mazeAssetCalibration';
      const ITEMS_URL = '../game_data/items/items.json';
      const ROOM_W = 9;
      const ROOM_D = 9;
      const WALL_LAYERS = 3;
      function loadCalibration() {
        try {
          const raw = localStorage.getItem(CALIB_KEY);
          if (!raw) return null;
          const data = JSON.parse(raw);
          return data && typeof data === 'object' ? data : null;
        }
        catch {
          return null;
        }
      }
      const calib = loadCalibration() || {
      };
      const CELL_SIZE = Number.isFinite(calib.cellSize) ? calib.cellSize : 6;
      const ASSET_SIZE = Number.isFinite(calib.assetSize) ? calib.assetSize : 6;
      const WALL_SCALE = Number.isFinite(calib.wallScale) ? calib.wallScale : 1;
      const ASSET_ORIGIN = (calib.assetOrigin === 'base' || calib.assetOrigin === 'center') ? calib.assetOrigin : 'center';
      const FULL_ADJ = {
        pos: {
          x: Number(calib.adjust?.full?.pos?.x) || 0,          y: Number(calib.adjust?.full?.pos?.y) || 0,          z: Number(calib.adjust?.full?.pos?.z) || 0,
        },        rotY: Number(calib.adjust?.full?.rotY) || 0,        scale: Number(calib.adjust?.full?.scale) || 1,
      };
      const MODEL_SCALE = (CELL_SIZE / ASSET_SIZE) * WALL_SCALE * FULL_ADJ.scale;
      const BLOCK_SIZE = CELL_SIZE * WALL_SCALE * FULL_ADJ.scale;
      const WALL_EDGE_SHIFT = (BLOCK_SIZE - CELL_SIZE) * 0.5;
      const halfW = (ROOM_W - 1) * CELL_SIZE * 0.5;
      const halfD = (ROOM_D - 1) * CELL_SIZE * 0.5;
      const wallHeight = WALL_LAYERS * BLOCK_SIZE;
      const baseY = ASSET_ORIGIN === 'center' ? (BLOCK_SIZE * 0.5) : 0;
      const ITEM_BASE_SCALE = (CELL_SIZE / ASSET_SIZE) * 0.55;
      const ITEM_BASE_Y = BLOCK_SIZE * 0.15;
      // Ajusta altura global de items (negativo baja). Cambialo para mover todos los items.
      const ITEM_Y_OFFSET = -BLOCK_SIZE * 0.05;
      // Ajusta distancia maxima para mostrar info del item al mirarlo.
      const ITEM_FOCUS_DISTANCE = CELL_SIZE * 1.6;
      // Ajusta el angulo del cono de mirada (1 = muy estricto, 0.9 = mas ancho).
      const ITEM_FOCUS_DOT = 0.94;
      const colliders = [];
      const itemsState = [];
      const inventory = [];
      const MODE_LIMITS = {
        casual: 6,        normal: 4,        dificil: 2,        hardcore: 1,
      };
      const headingVector = new THREE.Vector3();
      const cameraWorldPos = new THREE.Vector3();
      const cameraForward = new THREE.Vector3();
      const itemWorldPos = new THREE.Vector3();
      const toItemDir = new THREE.Vector3();
      let statusTimer = null;
      function addWall(ix, iz) {
        const shiftX = (ix === 0) ? WALL_EDGE_SHIFT : (ix === ROOM_W - 1) ? -WALL_EDGE_SHIFT : 0;
        const shiftZ = (iz === 0) ? WALL_EDGE_SHIFT : (iz === ROOM_D - 1) ? -WALL_EDGE_SHIFT : 0;
        const wxCell = (ix * CELL_SIZE) - halfW + shiftX;
        const wzCell = (iz * CELL_SIZE) - halfD + shiftZ;
        const yaw = FULL_ADJ.rotY || 0;
        const rad = yaw * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const ox = FULL_ADJ.pos.x;
        const oz = FULL_ADJ.pos.z;
        const rx = (ox * cos) + (oz * sin);
        const rz = (-ox * sin) + (oz * cos);
        const wx = wxCell;
        const wz = wzCell;
        for (let layer = 0;
        layer < WALL_LAYERS;
        layer++) {
          const holder = document.createElement('a-entity');
          const wy = baseY + (layer * BLOCK_SIZE);
          holder.setAttribute('position', `${wx} ${wy} ${wz}`);
          const model = document.createElement('a-entity');
          model.setAttribute('gltf-model', '#mdl-full');
          model.setAttribute('position', `${rx} ${FULL_ADJ.pos.y} ${rz}`);
          model.setAttribute('rotation', `0 ${yaw} 0`);
          model.setAttribute('scale', `${MODEL_SCALE} ${MODEL_SCALE} ${MODEL_SCALE}`);
          holder.appendChild(model);
          roomEl.appendChild(holder);
        }
        const half = BLOCK_SIZE * 0.5;
        const colliderX = wxCell;
        const colliderZ = wzCell;
        const colliderMinY = 0;
        colliders.push({
          minX: colliderX - half,          maxX: colliderX + half,          minZ: colliderZ - half,          maxZ: colliderZ + half,          minY: colliderMinY,          maxY: colliderMinY + wallHeight,
        });
      }
      function buildRoom() {
        roomEl.innerHTML = '';
        colliders.length = 0;
        floorEl.setAttribute('width', ROOM_W * CELL_SIZE);
        floorEl.setAttribute('height', ROOM_D * CELL_SIZE);
        floorEl.setAttribute('position', '0 0 0');
        for (let x = 0;
        x < ROOM_W;
        x++) {
          addWall(x, 0);
          addWall(x, ROOM_D - 1);
        }
        for (let z = 1;
        z < ROOM_D - 1;
        z++) {
          addWall(0, z);
          addWall(ROOM_W - 1, z);
        }
      }
      function resolveAssetPath(path) {
        if (!path || typeof path !== 'string') return '';
        if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/')) return path;
        if (path.startsWith('../') || path.startsWith('./')) return path;
        return `../${path}`;
      }
      function clearItems() {
        roomEl.querySelectorAll('.pickup-item').forEach((el) => el.remove());
        itemsState.length = 0;
        inventory.length = 0;
        updateHud();
      }
      function setStatus(text, warn = false) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.style.color = warn ? '#f97316' : 'var(--muted)';
        if (statusTimer) {
          clearTimeout(statusTimer);
          statusTimer = null;
        }
        if (warn) {
          statusTimer = setTimeout(() => {
            statusEl.textContent = 'E para recoger';
            statusEl.style.color = 'var(--muted)';
          }, 2000);
        }
      }
      function getMaxItems() {
        const mode = modeSelect?.value || 'normal';
        return MODE_LIMITS[mode] ?? 4;
      }
      function renderItemRow(item) {
        const row = document.createElement('div');
        row.className = 'item-row';
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = item.color || '#8892a0';
        const label = document.createElement('span');
        label.textContent = item.nombre || item.id || 'Item';
        row.appendChild(swatch);
        row.appendChild(label);
        return row;
      }
      function updateHud() {
        const maxItems = getMaxItems();
        if (invMaxEl) invMaxEl.textContent = String(maxItems);
        if (invMaxLabelEl) invMaxLabelEl.textContent = String(maxItems);
        if (invCountEl) invCountEl.textContent = String(inventory.length);
        if (invListEl) {
          invListEl.innerHTML = '';
          inventory.forEach((item) => invListEl.appendChild(renderItemRow(item)));
        }
        const available = itemsState.filter((entry) => !entry.picked).map((entry) => entry.data);
        if (availCountEl) availCountEl.textContent = String(available.length);
        if (availListEl) {
          availListEl.innerHTML = '';
          available.forEach((item) => availListEl.appendChild(renderItemRow(item)));
        }
      }
      function normalizeHeading(deg) {
        return ((deg % 360) + 360) % 360;
      }
      function headingFromCamera() {
        const headingSource = cameraEl?.object3D || headEl?.object3D;
        if (!headingSource) return 0;
        headingSource.getWorldDirection(headingVector);
        headingVector.y = 0;
        if (headingVector.lengthSq() < 0.0001) return 0;
        headingVector.normalize();
        const rad = Math.atan2(headingVector.x, -headingVector.z);
        return normalizeHeading(rad * 180 / Math.PI);
      }
      function headingToCardinal(deg) {
        if (deg >= 315 || deg < 45) return 'N';
        if (deg >= 45 && deg < 135) return 'E';
        if (deg >= 135 && deg < 225) return 'S';
        return 'W';
      }
      function findLookedItem() {
        const source = cameraEl?.object3D || headEl?.object3D;
        if (!source) return null;
        source.getWorldPosition(cameraWorldPos);
        source.getWorldDirection(cameraForward);
        cameraForward.normalize();
        let best = null;
        let bestScore = -Infinity;
        for (const entry of itemsState) {
          if (!entry || entry.picked || !entry.el) continue;
          entry.el.object3D.getWorldPosition(itemWorldPos);
          toItemDir.copy(itemWorldPos).sub(cameraWorldPos);
          const dist = toItemDir.length();
          if (!Number.isFinite(dist) || dist <= 0.001 || dist > ITEM_FOCUS_DISTANCE) continue;
          toItemDir.divideScalar(dist);
          const dot = cameraForward.dot(toItemDir);
          if (dot < ITEM_FOCUS_DOT) continue;
          const score = (dot * 2) - (dist / ITEM_FOCUS_DISTANCE);
          if (score > bestScore) {
            bestScore = score;
            best = entry;
          }
        }
        return best;
      }
      function updateFocusHud() {
        if (!focusPanelEl || !focusNameEl || !focusDescEl) return;
        const entry = findLookedItem();
        if (!entry) {
          focusPanelEl.hidden = true;
          return;
        }
        const name = entry.data?.nombre || entry.data?.name || entry.data?.id || 'Item';
        const desc = entry.data?.descripcion || entry.data?.description || '';
        focusNameEl.textContent = name;
        focusDescEl.textContent = desc;
        focusDescEl.style.display = desc ? 'block' : 'none';
        focusPanelEl.hidden = false;
      }
      function updateNavHud() {
        const player = document.getElementById('player');
        if (player && player.object3D) {
          const pos = player.object3D.position;
          const step = Math.max(0.01, BLOCK_SIZE);
          const bx = Math.round(pos.x / step);
          const by = Math.round(pos.y / step);
          const bz = Math.round(pos.z / step);
          if (coordXEl) coordXEl.textContent = String(bx);
          if (coordYEl) coordYEl.textContent = String(by);
          if (coordZEl) coordZEl.textContent = String(bz);
          if (coordCellEl) {
            const cx = Math.round((pos.x + halfW) / CELL_SIZE);
            const cz = Math.round((pos.z + halfD) / CELL_SIZE);
            const clampedX = Math.max(0, Math.min(ROOM_W - 1, cx));
            const clampedZ = Math.max(0, Math.min(ROOM_D - 1, cz));
            coordCellEl.textContent = `cell ${clampedX},${clampedZ}`;
          }
        }
        const heading = headingFromCamera();
        if (headingEl) headingEl.textContent = heading.toFixed(0);
        if (compassNeedleEl) {
          const needleRot = -heading;
          compassNeedleEl.style.setProperty('--needle-rot', `${needleRot}deg`);
        }
        updateFocusHud();
        requestAnimationFrame(updateNavHud);
      }
      function createFallbackDiamond(parentEl, color) {
        const diamond = document.createElement('a-octahedron');
        diamond.setAttribute('radius', BLOCK_SIZE * 0.22);
        diamond.setAttribute('color', color || '#f59e0b');
        diamond.setAttribute('position', `0 ${BLOCK_SIZE * 0.2} 0`);
        diamond.setAttribute('material', 'metalness: 0.1; roughness: 0.35');
        parentEl.appendChild(diamond);
      }
      function recenterItemModel(el, origin = 'base') {
        const model = el.getObject3D('mesh');
        if (!model) return;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const centerWorld = new THREE.Vector3();
        const sizeWorld = new THREE.Vector3();
        let hasMesh = false;
        model.traverse((node) => {
          if (!node.isMesh && !node.isSkinnedMesh) return;
          if (!node.geometry) return;
          node.geometry.computeBoundingBox();
          if (!node.geometry.boundingBox) return;
          const nodeBox = node.geometry.boundingBox.clone();
          nodeBox.applyMatrix4(node.matrixWorld);
          box.union(nodeBox);
          hasMesh = true;
        });
        if (!hasMesh || box.isEmpty()) return;
        box.getCenter(centerWorld);
        box.getSize(sizeWorld);
        const maxDim = Math.max(sizeWorld.x, sizeWorld.y, sizeWorld.z);
        if (!Number.isFinite(maxDim) || maxDim <= 0) return;
        if (maxDim > (BLOCK_SIZE * 10)) return;
        const parent = model.parent || model;
        const centerLocal = parent.worldToLocal(centerWorld.clone());
        const minLocal = parent.worldToLocal(box.min.clone());
        if (!Number.isFinite(centerLocal.x) || !Number.isFinite(centerLocal.y) || !Number.isFinite(centerLocal.z)) return;
        model.position.x -= centerLocal.x;
        model.position.z -= centerLocal.z;
        if (origin === 'center') model.position.y -= centerLocal.y;
        else model.position.y -= minLocal.y;
        model.updateMatrixWorld(true);
      }
      function placeItems(items) {
        const innerCells = [];
        for (let z = 1; z < ROOM_D - 1; z++) {
          for (let x = 1; x < ROOM_W - 1; x++) {
            innerCells.push({ x, z });
          }
        }
        items.forEach((item, index) => {
          const cell = innerCells[index % innerCells.length];
          const x = (cell.x * CELL_SIZE) - halfW;
          const z = (cell.z * CELL_SIZE) - halfD;
          const entity = document.createElement('a-entity');
          const assetPath = resolveAssetPath(item.asset);
          const itemScale = ITEM_BASE_SCALE * (Number(item.scale) || 1);
          const y = ITEM_BASE_Y + ITEM_Y_OFFSET + (Number(item.yOffset) || 0);
          const xOffset = Number(item.xOffset) || 0;
          const zOffset = Number(item.zOffset) || 0;
          entity.setAttribute('position', `${x + xOffset} ${y} ${z + zOffset}`);
          entity.setAttribute('data-item-id', item.id || '');
          entity.setAttribute('data-item-name', item.nombre || '');
          entity.setAttribute('class', 'pickup-item');
          if (assetPath) {
            entity.setAttribute('gltf-model', assetPath);
            entity.addEventListener('model-loaded', () => {
              if (item?.recenter === false) return;
              const origin = (item?.origin === 'center') ? 'center' : 'base';
              recenterItemModel(entity, origin);
            }, { once: true });
            entity.addEventListener('model-error', () => {
              entity.removeAttribute('gltf-model');
              createFallbackDiamond(entity, item.color);
            }, {
              once: true
            });
          }
          else {
            createFallbackDiamond(entity, item.color);
          }
          entity.setAttribute('scale', `${itemScale} ${itemScale} ${itemScale}`);
          const label = document.createElement('a-entity');
          label.setAttribute('text', `value: ${item.nombre || item.id || 'Item'}; align: center; color: #e7e3d9; width: 4`);
          label.setAttribute('position', `0 ${BLOCK_SIZE * 0.35} 0`);
          entity.appendChild(label);
          roomEl.appendChild(entity);
          itemsState.push({
            data: item, el: entity, picked: false
          });
        });
        updateHud();
      }
      async function loadItems() {
        try {
          clearItems();
          const res = await fetch(ITEMS_URL, {
            cache: 'no-store'
          });
          if (!res.ok) throw new Error('No se pudo cargar items.json');
          const items = await res.json();
          if (!Array.isArray(items)) throw new Error('items.json invalido');
          placeItems(items);
        }
        catch (err) {
          setStatus('No se pudieron cargar items', true);
        }
      }
      function tryPickup() {
        const maxItems = getMaxItems();
        if (inventory.length >= maxItems) {
          setStatus('Inventario lleno', true);
          return;
        }
        const playerPos = document.getElementById('player').object3D.position;
        let nearest = null;
        let nearestDist = Infinity;
        for (const entry of itemsState) {
          if (entry.picked || !entry.el) continue;
          const itemPos = new THREE.Vector3();
          entry.el.object3D.getWorldPosition(itemPos);
          const dx = itemPos.x - playerPos.x;
          const dz = itemPos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = entry;
          }
        }
        if (!nearest || nearestDist > (CELL_SIZE * 0.6)) {
          setStatus('Acercate mas al item', true);
          return;
        }
        nearest.picked = true;
        nearest.el.parentNode?.removeChild(nearest.el);
        inventory.push(nearest.data);
        updateHud();
      }
      function intersectsAabb(px, py, pz, radius, height, box) {
        const minX = px - radius;
        const maxX = px + radius;
        const minZ = pz - radius;
        const maxZ = pz + radius;
        const minY = py;
        const maxY = py + height;
        if (maxX <= box.minX || minX >= box.maxX) return false;
        if (maxZ <= box.minZ || minZ >= box.maxZ) return false;
        if (maxY <= box.minY || minY >= box.maxY) return false;
        return true;
      }
      function collidesAt(px, py, pz, radius, height) {
        for (const box of colliders) {
          if (intersectsAabb(px, py, pz, radius, height, box)) return true;
        }
        return false;
      }
      if (window.AFRAME && !AFRAME.components['room-player']) {
        AFRAME.registerComponent('room-player', {
          schema: {
            speed: {
              type: 'number', default: 4
            },            jump: {
              type: 'number', default: 6
            },            gravity: {
              type: 'number', default: 18
            },            radius: {
              type: 'number', default: 1.2
            },            height: {
              type: 'number', default: 1.6
            },            sprintMult: {
              type: 'number', default: 1.1
            },
          },          init() {
            this.velocity = new THREE.Vector3();
            this.keys = new Set();
            this.grounded = false;
            this.cameraEl = this.el.querySelector('[camera]');
            this._forward = new THREE.Vector3();
            this._right = new THREE.Vector3();
            this._up = new THREE.Vector3(0, 1, 0);
            this.sprinting = false;
            this.bodyEl = bodyEl;
            window.addEventListener('keydown', (e) => this.keys.add(e.code));
            window.addEventListener('keyup', (e) => this.keys.delete(e.code));
          },          tick(time, timeDelta) {
            const dt = Math.min(0.05, timeDelta / 1000);
            if (!dt) return;
            const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
            this.sprinting = sprinting;
            const speed = this.data.speed * (sprinting ? this.data.sprintMult : 1);
            const jump = this.data.jump;
            const gravity = this.data.gravity;
            const radius = this.data.radius;
            const height = this.data.height;
            const forward = this._forward;
            if (this.cameraEl) {
              this.cameraEl.object3D.getWorldDirection(forward);
            }
            forward.multiplyScalar(-1);
            forward.y = 0;
            forward.normalize();
            const right = this._right.crossVectors(forward, this._up).normalize();
            if (this.bodyEl) {
              const yaw = Math.atan2(forward.x, -forward.z);
              this.bodyEl.object3D.rotation.y = yaw;
            }
            const moveZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
            const moveX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
            const dir = new THREE.Vector3();
            dir.addScaledVector(forward, moveZ);
            dir.addScaledVector(right, moveX);
            if (dir.lengthSq() > 0) dir.normalize();
            this.velocity.x = dir.x * speed;
            this.velocity.z = dir.z * speed;
            if (this.keys.has('Space') && this.grounded) {
              this.velocity.y = jump;
              this.grounded = false;
            }
            this.velocity.y -= gravity * dt;
            const pos = this.el.object3D.position.clone();
            let nextX = pos.x + this.velocity.x * dt;
            if (collidesAt(nextX, pos.y, pos.z, radius, height)) {
              nextX = pos.x;
            }
            let nextZ = pos.z + this.velocity.z * dt;
            if (collidesAt(nextX, pos.y, nextZ, radius, height)) {
              nextZ = pos.z;
            }
            let nextY = pos.y + this.velocity.y * dt;
            if (nextY < 0) {
              nextY = 0;
              this.velocity.y = 0;
              this.grounded = true;
            }
            this.el.object3D.position.set(nextX, nextY, nextZ);
          },
        });
      }
      if (window.AFRAME && !AFRAME.components['step-bob']) {
        AFRAME.registerComponent('step-bob', {
          schema: {
            enabled: {
              type: 'boolean', default: true
            },            intensity: {
              type: 'number', default: 0.028
            },            frequency: {
              type: 'number', default: 3.4
            },            sway: {
              type: 'number', default: 0.45
            },            maxSpeed: {
              type: 'number', default: 4
            },            airScale: {
              type: 'number', default: 0.15
            },            jumpLift: {
              type: 'number', default: 0.035
            },            landDip: {
              type: 'number', default: 0.06
            },            strafeTilt: {
              type: 'number', default: 2.2
            },            spring: {
              type: 'number', default: 28
            },            damping: {
              type: 'number', default: 10
            },            sprintFov: {
              type: 'number', default: 4
            },            sprintBob: {
              type: 'number', default: 1.2
            },
          },          init() {
            this.basePos = this.el.object3D.position.clone();
            this.phase = 0;
            this.playerEl = this.el.parentEl;
            this.verticalOffset = 0;
            this.verticalVelocity = 0;
            this.wasGrounded = true;
            this._forward = new THREE.Vector3();
            this._right = new THREE.Vector3();
            this._up = new THREE.Vector3(0, 1, 0);
            this.cameraEl = this.el.querySelector('[camera]');
            this.baseFov = this.cameraEl ? (this.cameraEl.getAttribute('camera')?.fov ?? 80) : 80;
            this.currentFov = this.baseFov;
          },          tick(time, timeDelta) {
            const dt = Math.min(0.05, timeDelta / 1000);
            if (!dt) return;
            if (!this.data.enabled) {
              this.el.object3D.position.copy(this.basePos);
              this.el.object3D.rotation.z = 0;
              return;
            }
            const player = this.playerEl?.components?.['room-player'];
            const v = player?.velocity;
            const grounded = player?.grounded ?? true;
            const sprinting = player?.sprinting ?? false;
            const speed = v ? Math.sqrt((v.x * v.x) + (v.z * v.z)) : 0;
            const maxSpeedBase = this.data.maxSpeed > 0 ? this.data.maxSpeed : 1;
            const maxSpeed = maxSpeedBase * (sprinting ? 1.1 : 1);
            const t = Math.min(speed / maxSpeed, 1);
            const moveScale = (grounded ? 1 : this.data.airScale) * (sprinting ? this.data.sprintBob : 1);
            if (t > 0.01) {
              this.phase += dt * this.data.frequency * (0.35 + t * 0.65);
            }
            else {
              this.phase = 0;
            }
            if (grounded && !this.wasGrounded) {
              this.verticalVelocity -= this.data.landDip;
            }
            else if (!grounded && this.wasGrounded) {
              this.verticalVelocity += this.data.jumpLift;
            }
            this.wasGrounded = grounded;
            const spring = Math.max(1, this.data.spring);
            const damping = Math.max(0.1, this.data.damping);
            this.verticalVelocity += (-spring * this.verticalOffset - damping * this.verticalVelocity) * dt;
            this.verticalOffset += this.verticalVelocity * dt;
            const bob = Math.sin(this.phase * Math.PI * 2) * this.data.intensity * t * moveScale;
            let strafe = 0;
            if (player?.cameraEl) {
              player.cameraEl.object3D.getWorldDirection(this._forward);
              this._forward.multiplyScalar(-1);
              this._forward.y = 0;
              this._forward.normalize();
              this._right.crossVectors(this._forward, this._up).normalize();
              if (v) strafe = this._right.dot(v) / maxSpeed;
            }
            const sway = Math.sin(this.phase * Math.PI * 2) * THREE.MathUtils.degToRad(this.data.sway) * t * moveScale;
            const strafeTilt = THREE.MathUtils.degToRad(this.data.strafeTilt) * strafe;
            this.el.object3D.position.y = this.basePos.y + bob + this.verticalOffset;
            this.el.object3D.rotation.z = sway + strafeTilt;
            if (this.cameraEl) {
              const targetFov = this.baseFov + (sprinting ? this.data.sprintFov : 0);
              const lerp = 1 - Math.exp(-6 * dt);
              this.currentFov += (targetFov - this.currentFov) * lerp;
              this.cameraEl.setAttribute('camera', 'fov', this.currentFov);
            }
          },
        });
      }
      if (bobToggle && headEl) {
        bobToggle.addEventListener('change', () => {
          headEl.setAttribute('step-bob', 'enabled', bobToggle.checked);
        });
      }
      buildRoom();
      loadItems();
      updateHud();
      updateNavHud();
      if (modeSelect) {
        modeSelect.addEventListener('change', () => updateHud());
      }
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyE') tryPickup();
      });
  