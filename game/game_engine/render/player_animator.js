export function registerPlayerAnimator() {
  if (!window.AFRAME || AFRAME.components['player-animator']) return;

  AFRAME.registerComponent('player-animator', {
    schema: {
      idle: { type: 'string', default: 'idle' },
      walk: { type: 'string', default: 'walk' },
      run: { type: 'string', default: 'run' },
      attack: { type: 'string', default: 'atack' },
      death: { type: 'string', default: 'death' },
      jump: { type: 'string', default: 'jump' },
      crossFade: { type: 'number', default: 0.18 },
      speed: { type: 'number', default: 1 },
    },

    init() {
      this.mixer = null;
      this.actions = {};
      this.current = null;
      this.currentName = null;
      this.pending = null;
      this.ready = false;
      this._tmp = new THREE.Vector3();

      this.onModelLoaded = (event) => {
        const model = event?.detail?.model || this.el.getObject3D('mesh');
        if (!model || !window.THREE) return;
        const animations = this._resolveAnimations(event, model);
        if (!animations.length) return;

        this.mixer = new THREE.AnimationMixer(model);
        animations.forEach((clip) => {
          if (!clip || !clip.name) return;
          const key = String(clip.name).trim();
          this.actions[key.toLowerCase()] = this.mixer.clipAction(clip);
        });

        this.ready = true;
        if (this.pending) {
          const { name, options } = this.pending;
          this.pending = null;
          this.setState(name, options);
        } else {
          this.setState(this.data.idle);
        }
      };

      this.el.addEventListener('model-loaded', this.onModelLoaded);
    },

    _resolveAnimations(event, model) {
      const list = [];
      if (Array.isArray(model.animations) && model.animations.length) {
        return model.animations;
      }
      const mesh = this.el.getObject3D('mesh');
      if (mesh?.animations?.length) {
        return mesh.animations;
      }
      if (event?.detail?.animations?.length) {
        return event.detail.animations;
      }
      const comp = this.el.components && this.el.components['gltf-model'];
      if (comp?.model?.animations?.length) {
        return comp.model.animations;
      }
      if (comp?.model?.parent?.animations?.length) {
        return comp.model.parent.animations;
      }
      return list;
    },

    _resolveAction(name) {
      if (!name) return null;
      if (!this.actions) return null;
      const key = String(name).toLowerCase();
      if (this.actions[key]) return this.actions[key];
      const aliases = {
        idle: ['idle', 'stand', 'espera'],
        walk: ['walk', 'caminar', 'camina'],
        run: ['run', 'correr', 'sprint'],
        attack: ['attack', 'atack', 'atacar', 'golpe'],
        death: ['death', 'die', 'morir'],
        jump: ['jump', 'saltar'],
      };
      const lookup = aliases[key] || [key];
      const match = Object.keys(this.actions).find((n) => lookup.some((alias) => n.includes(alias)));
      if (match) return this.actions[match];
      return null;
    },

    getClipDuration(name) {
      if (!this.ready || !this.actions) return null;
      const action = this._resolveAction(name);
      if (!action) return null;
      const clip = action.getClip?.();
      return clip?.duration ?? null;
    },

    setState(name, options = {}) {
      if (!name) return;
      if (!this.ready) {
        this.pending = { name, options };
        return;
      }
      const action = this._resolveAction(name);
      if (!action) return;
      if (!options.force && this.current === action) return;

      const fade = Math.max(0, this.data.crossFade);
      if (this.current && this.current !== action) {
        this.current.fadeOut(fade);
      }

      const loopOnce = Boolean(options.once);
      action.enabled = true;
      action.reset();
      action.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
      action.clampWhenFinished = loopOnce;
      action.fadeIn(fade);
      action.play();
      action.timeScale = this.data.speed;

      this.current = action;
      this.currentName = name;
    },

    tick(time, delta) {
      if (!this.mixer || !this.ready || this.paused) return;
      this.mixer.update(Math.max(0, delta) / 1000);
    },

    setPaused(state = true) {
      this.paused = Boolean(state);
      if (this.mixer) this.mixer.timeScale = this.paused ? 0 : 1;
    },

    remove() {
      if (this.mixer) this.mixer.stopAllAction();
      this.el.removeEventListener('model-loaded', this.onModelLoaded);
      this.mixer = null;
      this.actions = {};
      this.current = null;
      this.ready = false;
    },
  });
}
