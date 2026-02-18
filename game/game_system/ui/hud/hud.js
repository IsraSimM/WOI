const HUD_URL = new URL('./hud.html', import.meta.url);

export async function mountHud(rootEl) {
  const res = await fetch(HUD_URL);
  const html = await res.text();
  rootEl.innerHTML = html;

  const scoreEl = rootEl.querySelector('#hudScore');
  const elimsEl = rootEl.querySelector('#hudElims');
  const modeEl = rootEl.querySelector('#hudMode');
  const diffEl = rootEl.querySelector('#hudDifficulty');
  const livesEl = rootEl.querySelector('#hudLives');
  const livesDotsEl = rootEl.querySelector('#hudLivesDots');
  const speedEl = rootEl.querySelector('#hudSpeed');
  const lifePercentEl = rootEl.querySelector('#hudLifePercent');
  const lifeFillEl = rootEl.querySelector('#hudLifeFill');
  const objectiveEl = rootEl.querySelector('#hudObjective');
  const timeEl = rootEl.querySelector('#hudTime');
  const itemsEl = rootEl.querySelector('#hudItems');
  const itemNameEl = rootEl.querySelector('#hudItemName');
  const itemDescEl = rootEl.querySelector('#hudItemDesc');
  const effectsEl = rootEl.querySelector('#hudEffects');
  const statusEl = rootEl.querySelector('#hudStatus');
  const ammoCurrentEl = rootEl.querySelector('#hudAmmoCurrent');
  const ammoTotalEl = rootEl.querySelector('#hudAmmoTotal');
  const weaponEl = rootEl.querySelector('#hudWeapon');
  const dashCountEl = rootEl.querySelector('#hudDashCount');
  const dashCooldownEl = rootEl.querySelector('#hudDashCooldown');
  const finalWrapEl = rootEl.querySelector('#hudFinalWrap');
  const finalTimeEl = rootEl.querySelector('#hudFinalTime');
  const minimapEl = rootEl.querySelector('#hudMinimap');
  const minimapCtx = minimapEl?.getContext ? minimapEl.getContext('2d') : null;
  const enemyPanelEl = rootEl.querySelector('#hudEnemyPanel');
  const enemyNameEl = rootEl.querySelector('#hudEnemyName');
  const enemyHpTextEl = rootEl.querySelector('#hudEnemyHpText');
  const enemyHpFillEl = rootEl.querySelector('#hudEnemyHpFill');
  const enemyStatsEl = rootEl.querySelector('#hudEnemyStats');

  let slotCount = 4;
  const minimapState = {
    ready: false,
    map: null,
    width: 0,
    height: 0,
    radiusCells: 7,
    radiusPx: 0,
    scale: 1,
    centerX: 0,
    centerY: 0,
  };

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function formatTime(ms) {
    const raw = Number(ms);
    if (!Number.isFinite(raw)) return '--:--';
    const total = Math.max(0, Math.floor(raw / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatItemLabel(item) {
    if (!item) return 'VACIO';
    if (typeof item === 'string') return String(item).replace(/_/g, ' ').toUpperCase();
    if (typeof item === 'object' && item.label) return String(item.label).replace(/_/g, ' ').toUpperCase();
    return String(item).replace(/_/g, ' ').toUpperCase();
  }

  function renderSlots(items, selectedIndex = 0) {
    if (!itemsEl) return;
    itemsEl.innerHTML = '';
    const count = Math.max(1, slotCount);
    for (let i = 0; i < count; i++) {
      const slotData = items?.[i] || null;
      const slot = document.createElement('div');
      slot.className = 'inventory-slot' + (i === selectedIndex ? ' selected' : '');

      const key = document.createElement('div');
      key.className = 'slot-key';
      key.textContent = String(i + 1);

      const label = document.createElement('div');
      label.className = 'slot-label';
      label.textContent = formatItemLabel(slotData);

      slot.appendChild(key);
      slot.appendChild(label);

      if (slotData && typeof slotData === 'object') {
        const cooldownRatio = Number(slotData.cooldownRatio) || 0;
        if (cooldownRatio > 0) {
          const bar = document.createElement('div');
          bar.className = 'slot-cooldown';
          const fill = document.createElement('div');
          fill.className = 'slot-cooldown-fill';
          fill.style.width = `${Math.max(0, Math.min(100, cooldownRatio * 100))}%`;
          bar.appendChild(fill);
          slot.appendChild(bar);
          if (slotData.cooldownText) {
            const text = document.createElement('div');
            text.className = 'slot-cooldown-text';
            text.textContent = slotData.cooldownText;
            slot.appendChild(text);
          }
        }
      }
      itemsEl.appendChild(slot);
    }
  }

  function renderEffects(effects) {
    if (!effectsEl) return;
    effectsEl.innerHTML = '';
    if (!effects?.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'effect-card';
      placeholder.textContent = 'SIN EFECTOS';
      effectsEl.appendChild(placeholder);
      return;
    }
    effects.forEach((effect) => {
      const name = typeof effect === 'string' ? effect : effect?.name || effect?.label || effect?.id || 'EFECTO';
      const ratio = Number(effect?.ratio);
      const card = document.createElement('div');
      card.className = 'effect-card';

      const label = document.createElement('div');
      label.textContent = String(name).toUpperCase();

      const value = document.createElement('div');
      value.className = 'effect-value';
      value.textContent = effect?.remainingText || 'ACTIVO';

      card.appendChild(label);
      card.appendChild(value);
      if (Number.isFinite(ratio) && ratio >= 0) {
        const bar = document.createElement('div');
        bar.className = 'effect-bar';
        const fill = document.createElement('div');
        fill.className = 'effect-fill';
        fill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
        bar.appendChild(fill);
        card.appendChild(bar);
      }
      effectsEl.appendChild(card);
    });
  }

  function setupMinimapState({ map, width, height, radiusCells = 7 }) {
    if (!minimapEl || !minimapCtx || !map || !width || !height) return;
    const size = Math.min(minimapEl.width || 180, minimapEl.height || 180);
    const padding = 14;
    const radiusPx = Math.max(40, (size * 0.5) - padding);

    minimapState.map = map;
    minimapState.width = width;
    minimapState.height = height;
    minimapState.radiusCells = Math.max(3, Number(radiusCells) || 7);
    minimapState.radiusPx = radiusPx;
    minimapState.scale = radiusPx / minimapState.radiusCells;
    minimapState.centerX = (minimapEl.width || size) * 0.5;
    minimapState.centerY = (minimapEl.height || size) * 0.5;
    minimapState.ready = true;
  }

  function drawMinimap({ player, enemies, items, goal, rotation }) {
    if (!minimapCtx || !minimapState.ready || !minimapState.map || !player) return;

    const ctx = minimapCtx;
    const width = minimapEl.width || 180;
    const height = minimapEl.height || 180;
    const centerX = minimapState.centerX;
    const centerY = minimapState.centerY;
    const radiusPx = minimapState.radiusPx;
    const scale = minimapState.scale;
    const radiusCells = minimapState.radiusCells;
    const map = minimapState.map;
    const mapW = minimapState.width;
    const mapH = minimapState.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.75)';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.clip();

    const startX = Math.max(0, player.x - radiusCells);
    const endX = Math.min(mapW - 1, player.x + radiusCells);
    const startY = Math.max(0, player.y - radiusCells);
    const endY = Math.min(mapH - 1, player.y + radiusCells);

    ctx.fillStyle = 'rgba(32, 46, 60, 0.9)';
    for (let y = startY; y <= endY; y++) {
      const row = y * mapW;
      for (let x = startX; x <= endX; x++) {
        const dx = x - player.x;
        const dy = y - player.y;
        if ((dx * dx + dy * dy) > radiusCells * radiusCells) continue;
        if (map[row + x] !== 1) continue;
        const px = centerX + dx * scale - scale * 0.5;
        const py = centerY + dy * scale - scale * 0.5;
        ctx.fillRect(px, py, scale, scale);
      }
    }

    const drawDot = (cellPos, color, radius = 3, clamp = true) => {
      if (!cellPos || !Number.isFinite(cellPos.x) || !Number.isFinite(cellPos.y)) return;
      let dx = cellPos.x - player.x;
      let dy = cellPos.y - player.y;
      const dist = Math.hypot(dx, dy);
      let alpha = 1;
      if (dist > radiusCells) {
        if (!clamp) return;
        const t = radiusCells / dist;
        dx *= t;
        dy *= t;
        alpha = 0.55;
      }
      const px = centerX + dx * scale;
      const py = centerY + dy * scale;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    if (goal) drawDot(goal, '#ff784f', 3, true);
    if (Array.isArray(items)) {
      items.forEach((item) => drawDot(item, '#2bd8ff', 2.5, true));
    }
    if (Array.isArray(enemies)) {
      enemies.forEach((enemy) => drawDot(enemy, '#ff5a66', 2.5, true));
    }

    const angle = Number.isFinite(rotation) ? rotation : 0;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.fillStyle = '#23f1a8';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 6);
    ctx.lineTo(-4.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    ctx.strokeStyle = 'rgba(56, 132, 164, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  renderSlots([]);
  renderEffects([]);

  return {
    setMode: (mode) => setText(modeEl, mode || '-'),
    setDifficulty: (diff) => setText(diffEl, diff || '-'),
    setAttempts: (attemptsUsed, attemptsLimit) => {
      const used = Number.isFinite(attemptsUsed) ? Math.max(0, Math.round(attemptsUsed)) : 0;
      const limit = Number.isFinite(attemptsLimit) ? Math.max(1, Math.round(attemptsLimit)) : null;
      setText(livesEl, limit ? `${used}/${limit}` : String(used));
      if (livesDotsEl) {
        livesDotsEl.innerHTML = '';
        const total = limit || 6;
        const count = Math.min(total, used);
        for (let i = 0; i < total; i++) {
          const dot = document.createElement('div');
          dot.className = 'stat-dot' + (i < count ? ' active' : '');
          livesDotsEl.appendChild(dot);
        }
      }
    },
    setHealth: (value, max = 100) => {
      if (!lifePercentEl || !lifeFillEl) return;
      const current = Number(value);
      const maxVal = Number(max);
      if (!Number.isFinite(current) || !Number.isFinite(maxVal) || maxVal <= 0) {
        lifePercentEl.textContent = '--%';
        lifeFillEl.style.width = '0%';
        return;
      }
      const percent = Math.max(0, Math.min(100, (current / maxVal) * 100));
      lifePercentEl.textContent = `${Math.round(percent)}%`;
      lifeFillEl.style.width = `${percent}%`;
    },
    setSpeed: (value) => {
      if (!speedEl) return;
      const num = Number(value);
      if (!Number.isFinite(num)) {
        speedEl.textContent = '--';
        return;
      }
      speedEl.textContent = `x${num.toFixed(2)}`;
    },
    setObjective: (text) => setText(objectiveEl, text || '-'),
    setTime: (time) => {
      if (!timeEl) return;
      if (typeof time === 'string') {
        timeEl.textContent = time;
        return;
      }
      timeEl.textContent = formatTime(time);
    },
    setItems: (items, selectedIndex = 0) => {
      if (Array.isArray(items) && items.length) {
        slotCount = items.length;
      }
      renderSlots(items || [], selectedIndex);
    },
    setEffects: (effects) => {
      renderEffects(effects || []);
    },
    setStatus: (text) => setText(statusEl, text || ''),
    setItemFocus: (name, desc) => {
      if (itemNameEl) itemNameEl.textContent = name || '-';
      if (itemDescEl) itemDescEl.textContent = desc || 'Apunta a un item para ver detalles.';
    },
    setScore: (value) => {
      if (!scoreEl) return;
      const num = Number(value);
      scoreEl.textContent = Number.isFinite(num) ? String(num).padStart(6, '0') : '000000';
    },
    setElims: (value) => {
      if (!elimsEl) return;
      const num = Number(value);
      elimsEl.textContent = Number.isFinite(num) ? String(num).padStart(2, '0') : '00';
    },
    setWeapon: (name) => setText(weaponEl, name || 'SISTEMA BASICO'),
    setAmmo: (current, total) => {
      if (ammoCurrentEl) ammoCurrentEl.textContent = current != null ? String(current) : '--';
      if (ammoTotalEl) ammoTotalEl.textContent = total != null ? `/${total}` : '/--';
    },
    setDash: (count, cooldownSeconds) => {
      if (dashCountEl) dashCountEl.textContent = Number.isFinite(count) ? String(count) : '--';
      if (dashCooldownEl) {
        const cd = Number(cooldownSeconds);
        dashCooldownEl.textContent = Number.isFinite(cd) ? `${cd.toFixed(1)}s` : '--';
      }
    },
    setFinalTimer: (remainingMs, active = true) => {
      if (!finalWrapEl || !finalTimeEl) return;
      finalWrapEl.style.display = active ? 'grid' : 'none';
      if (!active) return;
      const raw = Number(remainingMs);
      if (!Number.isFinite(raw)) {
        finalTimeEl.textContent = '--:--';
        return;
      }
      const total = Math.max(0, Math.ceil(raw / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      finalTimeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    },
    setEnemyFocus: (data) => {
      if (!enemyPanelEl) return;
      if (!data) {
        if (enemyNameEl) enemyNameEl.textContent = '-';
        if (enemyHpTextEl) enemyHpTextEl.textContent = '--/--';
        if (enemyHpFillEl) enemyHpFillEl.style.width = '0%';
        if (enemyStatsEl) enemyStatsEl.textContent = 'Sin objetivo';
        return;
      }
      const name = data.name || data.id || '-';
      const hp = Number.isFinite(data.hp) ? data.hp : 0;
      const maxHp = Number.isFinite(data.maxHp) ? data.maxHp : 0;
      if (enemyNameEl) enemyNameEl.textContent = String(name).toUpperCase();
      if (enemyHpTextEl) enemyHpTextEl.textContent = `${Math.max(0, Math.round(hp))}/${Math.max(0, Math.round(maxHp))}`;
      if (enemyHpFillEl) {
        const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
        enemyHpFillEl.style.width = `${ratio * 100}%`;
      }
      if (enemyStatsEl) enemyStatsEl.textContent = data.stats || '';
    },
    initMinimap: ({ map, width, height, start, end, radiusCells }) => {
      setupMinimapState({ map, width, height, radiusCells });
      drawMinimap({ player: start, enemies: [], items: [], goal: end, rotation: 0 });
    },
    updateMinimap: ({ player, enemies, items, goal, rotation }) => {
      drawMinimap({ player, enemies, items, goal, rotation });
    },
  };
}
