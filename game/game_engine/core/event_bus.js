const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  const set = listeners.get(event);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) listeners.delete(event);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of Array.from(set)) {
    try {
      handler(payload);
    } catch (err) {
      // Evita romper el loop principal
      console.error('[event_bus] handler error', err);
    }
  }
}
