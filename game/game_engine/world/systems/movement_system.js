export function registerMovementSystem({ collisionSystem, bodyEl = null } = {}) {
  if (!window.AFRAME || AFRAME.components['room-player']) return;
  const collidesAt = collisionSystem?.collidesAt || (() => false);

  AFRAME.registerComponent('room-player', {
    schema: {
      speed: { type: 'number', default: 4 },
      jump: { type: 'number', default: 6 },
      gravity: { type: 'number', default: 18 },
      radius: { type: 'number', default: 0.35 },
      height: { type: 'number', default: 1.6 },
      sprintMult: { type: 'number', default: 1.1 },
      dashDistance: { type: 'number', default: 12 },
      dashCooldown: { type: 'number', default: 1.5 },
      dashKey: { type: 'string', default: '' },
      dashMouseKey: { type: 'string', default: 'MouseRight' },
      dashMouseButton: { type: 'number', default: 2 },
      dashWalls: { type: 'number', default: 1 },
      dashUses: { type: 'number', default: 1 },
      dashStep: { type: 'number', default: 0.6 },
      turnSpeed: { type: 'number', default: 8 },
    },

    init() {
      this.velocity = new THREE.Vector3();
      this.keys = new Set();
      this.justPressed = new Set();
      this.grounded = false;
      this.cameraEl = this.el.querySelector('[camera]');
      this._forward = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
      this.sprinting = false;
      this.lastDashAt = -Infinity;
      this.dashCharges = this.data.dashUses;
      this.bodyEl = bodyEl;
      this.virtual = {
        moveX: 0,
        moveZ: 0,
        dash: false,
        jump: false,
        sprint: false,
      };
      this.setVirtualMove = (x = 0, z = 0) => {
        const clamp = (value) => Math.max(-1, Math.min(1, Number(value) || 0));
        this.virtual.moveX = clamp(x);
        this.virtual.moveZ = clamp(z);
      };
      this.triggerVirtualDash = () => {
        this.virtual.dash = true;
      };
      this.triggerVirtualJump = () => {
        this.virtual.jump = true;
      };
      this.setVirtualSprinting = (active) => {
        this.virtual.sprint = Boolean(active);
      };

      window.addEventListener('keydown', (e) => {
        if (!this.keys.has(e.code)) this.justPressed.add(e.code);
        this.keys.add(e.code);
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('mousedown', (e) => {
        if (e.button === this.data.dashMouseButton) {
          this.justPressed.add(this.data.dashMouseKey);
        }
      });
      window.addEventListener('contextmenu', (e) => {
        if (e.button === this.data.dashMouseButton) e.preventDefault();
      });
    },

    tick(time, timeDelta) {
      const dt = Math.min(0.05, timeDelta / 1000);
      if (!dt) return;

      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtual.sprint;
      this.sprinting = sprinting;

      const speed = this.data.speed * (sprinting ? this.data.sprintMult : 1);
      const jump = this.data.jump;
      const gravity = this.data.gravity;
      const radius = this.data.radius;
      const height = this.data.height;

      const camForward = this._forward;
      if (this.cameraEl) {
        this.cameraEl.object3D.getWorldDirection(camForward);
      }
      camForward.y = 0;
      camForward.normalize();
      const forward = camForward.clone().multiplyScalar(-1);

      const right = this._right.crossVectors(forward, this._up).normalize();

      if (this.bodyEl) {
        const yaw = Math.atan2(-camForward.x, -camForward.z);
        const current = this.bodyEl.object3D.rotation.y;
        const delta = ((yaw - current + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnFactor = Math.min(1, Math.max(0, this.data.turnSpeed) * dt);
        this.bodyEl.object3D.rotation.y = current + delta * turnFactor;
      }

      const dashFromKey = this.data.dashKey && this.justPressed.has(this.data.dashKey);
      const dashFromMouse = this.justPressed.has(this.data.dashMouseKey);
      const dashFromVirtual = this.virtual.dash;
      if (dashFromKey || dashFromMouse || dashFromVirtual) {
        const cooldownMs = Math.max(0, this.data.dashCooldown * 1000);
        if (time - this.lastDashAt >= cooldownMs && this.dashCharges > 0) {
          const dir = forward.clone();
          if (dir.lengthSq() > 0) {
            const dashDistance = Math.max(0.5, this.data.dashDistance);
            const dashStep = Math.max(0.2, this.data.dashStep);
            const allowedWalls = Math.max(0, Math.round(this.data.dashWalls));

            const pos = this.el.object3D.position.clone();
            const lastFree = pos.clone();
            let insideWall = collidesAt(pos.x, pos.y, pos.z, radius, height);
            let crossed = 0;

            for (let dist = dashStep; dist <= dashDistance; dist += dashStep) {
              const tx = pos.x + dir.x * dist;
              const tz = pos.z + dir.z * dist;
              const hit = collidesAt(tx, pos.y, tz, radius, height);

              if (hit && !insideWall) {
                crossed += 1;
                insideWall = true;
                if (crossed > allowedWalls) break;
              } else if (!hit && insideWall) {
                insideWall = false;
              }

              if (!hit) {
                lastFree.set(tx, pos.y, tz);
              }
            }

            if (!lastFree.equals(pos)) {
              this.el.object3D.position.set(lastFree.x, lastFree.y, lastFree.z);
              this.velocity.set(0, 0, 0);
              this.lastDashAt = time;
              this.dashCharges = Math.max(0, this.dashCharges - 1);
            }
          }
        }
      }
      this.virtual.dash = false;
      this.justPressed.clear();

      const moveZ = ((this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)) + this.virtual.moveZ;
      const moveX = ((this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)) + this.virtual.moveX;
      const clampedZ = Math.max(-1, Math.min(1, moveZ));
      const clampedX = Math.max(-1, Math.min(1, moveX));

      const dir = new THREE.Vector3();
      dir.addScaledVector(forward, clampedZ);
      dir.addScaledVector(right, clampedX);
      if (dir.lengthSq() > 0) dir.normalize();

      this.velocity.x = dir.x * speed;
      this.velocity.z = dir.z * speed;

      if ((this.keys.has('Space') || this.virtual.jump) && this.grounded) {
        this.velocity.y = jump;
        this.grounded = false;
      }
      this.virtual.jump = false;

      this.velocity.y -= gravity * dt;

      const pos = this.el.object3D.position.clone();
      let nextX = pos.x + this.velocity.x * dt;
      if (collidesAt(nextX, pos.y, pos.z, radius, height)) nextX = pos.x;

      let nextZ = pos.z + this.velocity.z * dt;
      if (collidesAt(nextX, pos.y, nextZ, radius, height)) nextZ = pos.z;

      let nextY = pos.y + this.velocity.y * dt;
      if (nextY < 0) {
        nextY = 0;
        this.velocity.y = 0;
        this.grounded = true;
      }

      this.el.object3D.position.set(nextX, nextY, nextZ);
      if (this.dashCharges < this.data.dashUses) {
        const cooldownMs = Math.max(0, this.data.dashCooldown * 1000);
        if (time - this.lastDashAt >= cooldownMs) {
          this.dashCharges = this.data.dashUses;
        }
      }
    },
  });
}

export function registerStepBob() {
  if (!window.AFRAME || AFRAME.components['step-bob']) return;
  AFRAME.registerComponent('step-bob', {
    schema: {
      enabled: { type: 'boolean', default: true },
      intensity: { type: 'number', default: 0.028 },
      frequency: { type: 'number', default: 3.4 },
      sway: { type: 'number', default: 0.45 },
      maxSpeed: { type: 'number', default: 8 },
      airScale: { type: 'number', default: 0.15 },
      jumpLift: { type: 'number', default: 0.035 },
      landDip: { type: 'number', default: 0.06 },
      strafeTilt: { type: 'number', default: 2.2 },
      spring: { type: 'number', default: 28 },
      damping: { type: 'number', default: 10 },
      sprintFov: { type: 'number', default: 4 },
      sprintBob: { type: 'number', default: 1.2 },
    },

    init() {
      this.velocity = new THREE.Vector3();
      this.lastPos = new THREE.Vector3();
      this.headPos = new THREE.Vector3();
      this.springVel = 0;
      this.baseFov = null;
    },

    tick(time, delta) {
      if (!this.data.enabled) return;
      const dt = Math.min(0.05, delta / 1000);
      if (!dt) return;

      const pos = this.el.object3D.position;
      this.velocity.subVectors(pos, this.lastPos).divideScalar(dt);
      this.lastPos.copy(pos);

      const speed = Math.min(this.data.maxSpeed, Math.hypot(this.velocity.x, this.velocity.z));
      const bob = Math.sin(time * 0.001 * this.data.frequency) * this.data.intensity * (speed / this.data.maxSpeed);

      const springTarget = bob + (this.velocity.y < -1 ? -this.data.landDip : 0) + (this.velocity.y > 1 ? this.data.jumpLift : 0);
      const diff = springTarget - this.headPos.y;
      this.springVel += diff * this.data.spring * dt;
      this.springVel *= Math.exp(-this.data.damping * dt);
      this.headPos.y += this.springVel * dt;

      this.el.object3D.position.y = pos.y + this.headPos.y;
    },
  });
}
