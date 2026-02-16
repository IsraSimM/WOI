/* Movimiento */ 

// Requiere: configuracionDatos.js (para bodyEl), Coliciones.js (para collidesAt)

/**
 * Componente A-Frame: room-player
 * Controla el movimiento del jugador con físicas simples
 */
if (window.AFRAME && !AFRAME.components['room-player']) {
  AFRAME.registerComponent('room-player', {
    schema: {
      speed: { type: 'number', default: 4 },
      jump: { type: 'number', default: 6 },
      gravity: { type: 'number', default: 18 },
      radius: { type: 'number', default: 1.2 },
      height: { type: 'number', default: 1.6 },
      sprintMult: { type: 'number', default: 1.1 },
    },
    
    init() {
      this.velocity = new THREE.Vector3();
      this.keys = new Set();
      this.grounded = false;
      this.cameraEl = this.el.querySelector('[camera]');
      this._forward = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
      this.sprinting = false;
      this.bodyEl = typeof bodyEl !== 'undefined' ? bodyEl : null;
      
      window.addEventListener('keydown', (e) => this.keys.add(e.code));
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    },
    
    tick(time, timeDelta) {
      const dt = Math.min(0.05, timeDelta / 1000);
      if (!dt) return;
      
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.sprinting = sprinting;
      
      const speed = this.data.speed * (sprinting ? this.data.sprintMult : 1);
      const jump = this.data.jump;
      const gravity = this.data.gravity;
      const radius = this.data.radius;
      const height = this.data.height;
      
      // Calcula dirección forward basada en la cámara
      const forward = this._forward;
      if (this.cameraEl) {
        this.cameraEl.object3D.getWorldDirection(forward);
      }
      forward.multiplyScalar(-1);
      forward.y = 0;
      forward.normalize();
      
      const right = this._right.crossVectors(forward, this._up).normalize();
      
      // Rota el body visual si existe
      if (this.bodyEl) {
        const yaw = Math.atan2(forward.x, -forward.z);
        this.bodyEl.object3D.rotation.y = yaw;
      }
      
      // Input de movimiento
      const moveZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const moveX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      
      const dir = new THREE.Vector3();
      dir.addScaledVector(forward, moveZ);
      dir.addScaledVector(right, moveX);
      if (dir.lengthSq() > 0) dir.normalize();
      
      this.velocity.x = dir.x * speed;
      this.velocity.z = dir.z * speed;
      
      // Salto
      if (this.keys.has('Space') && this.grounded) {
        this.velocity.y = jump;
        this.grounded = false;
      }
      
      // Gravedad
      this.velocity.y -= gravity * dt;
      
      // Colisiones y movimiento
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

/**
 * Componente A-Frame: step-bob
 * Simula el balanceo de cabeza al caminar
 */
if (window.AFRAME && !AFRAME.components['step-bob']) {
  AFRAME.registerComponent('step-bob', {
    schema: {
      enabled: { type: 'boolean', default: true },
      intensity: { type: 'number', default: 0.028 },
      frequency: { type: 'number', default: 3.4 },
      sway: { type: 'number', default: 0.45 },
      maxSpeed: { type: 'number', default: 4 },
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
    },
    
    tick(time, timeDelta) {
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
      
      // Avanza la fase del ciclo de paso
      if (t > 0.01) {
        this.phase += dt * this.data.frequency * (0.35 + t * 0.65);
      } else {
        this.phase = 0;
      }
      
      // Efecto de aterrizaje y salto
      if (grounded && !this.wasGrounded) {
        this.verticalVelocity -= this.data.landDip;
      } else if (!grounded && this.wasGrounded) {
        this.verticalVelocity += this.data.jumpLift;
      }
      this.wasGrounded = grounded;
      
      // Sistema de resorte para movimiento vertical suave
      const spring = Math.max(1, this.data.spring);
      const damping = Math.max(0.1, this.data.damping);
      this.verticalVelocity += (-spring * this.verticalOffset - damping * this.verticalVelocity) * dt;
      this.verticalOffset += this.verticalVelocity * dt;
      
      // Calcula bob vertical
      const bob = Math.sin(this.phase * Math.PI * 2) * this.data.intensity * t * moveScale;
      
      // Calcula inclinación por strafe
      let strafe = 0;
      if (player?.cameraEl) {
        player.cameraEl.object3D.getWorldDirection(this._forward);
        this._forward.multiplyScalar(-1);
        this._forward.y = 0;
        this._forward.normalize();
        this._right.crossVectors(this._forward, this._up).normalize();
        if (v) strafe = this._right.dot(v) / maxSpeed;
      }
      
      // Aplica sway y tilt
      const sway = Math.sin(this.phase * Math.PI * 2) * THREE.MathUtils.degToRad(this.data.sway) * t * moveScale;
      const strafeTilt = THREE.MathUtils.degToRad(this.data.strafeTilt) * strafe;
      
      this.el.object3D.position.y = this.basePos.y + bob + this.verticalOffset;
      this.el.object3D.rotation.z = sway + strafeTilt;
      
      // FOV sprint
      if (this.cameraEl) {
        const targetFov = this.baseFov + (sprinting ? this.data.sprintFov : 0);
        const lerp = 1 - Math.exp(-6 * dt);
        this.currentFov += (targetFov - this.currentFov) * lerp;
        this.cameraEl.setAttribute('camera', 'fov', this.currentFov);
      }
    },
  });
}