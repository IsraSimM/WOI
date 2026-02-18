const cache = new Map();

export async function fetchJson(url, { useCache = true } = {}) {
  const href = typeof url === 'string' ? url : url?.href;
  if (!href) throw new Error('fetchJson: url invalida');
  if (useCache && cache.has(href)) return cache.get(href);

  const res = await fetch(href, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`fetchJson: ${res.status} ${res.statusText} (${href})`);
  }
  const data = await res.json();
  if (useCache) cache.set(href, data);
  return data;
}

export function clearJsonCache() {
  cache.clear();
}
