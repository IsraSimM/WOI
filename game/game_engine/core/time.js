let rafId = null;

export function startLoop(onTick) {
  if (typeof onTick !== 'function') return;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(50, now - last);
    last = now;
    onTick(dt / 1000, now);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
