export function dijkstraPath(map, width, height, start, end) {
  if (!start || !end) return [];
  const key = (x, y) => y * width + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inBounds(start.x, start.y) || !inBounds(end.x, end.y)) return [];

  const WALL = 1;
  const isWalkable = (cell) => cell !== WALL;
  if (!isWalkable(map[key(start.x, start.y)]) || !isWalkable(map[key(end.x, end.y)])) return [];

  const total = width * height;
  const dist = new Int32Array(total);
  const prev = new Int32Array(total);
  const visited = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    dist[i] = 2147483647;
    prev[i] = -1;
  }
  const startIdx = key(start.x, start.y);
  const endIdx = key(end.x, end.y);
  dist[startIdx] = 0;

  const queue = [startIdx];
  while (queue.length) {
    let bestIdx = 0;
    let bestDist = dist[queue[0]];
    for (let i = 1; i < queue.length; i++) {
      const d = dist[queue[i]];
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const current = queue.splice(bestIdx, 1)[0];
    if (visited[current]) continue;
    visited[current] = 1;
    if (current === endIdx) break;

    const cx = current % width;
    const cy = Math.floor(current / width);
    const neighbors = [
      [cx, cy - 1],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx - 1, cy],
    ];
    for (const [nx, ny] of neighbors) {
      if (!inBounds(nx, ny)) continue;
      const nIdx = key(nx, ny);
      if (visited[nIdx]) continue;
      if (!isWalkable(map[nIdx])) continue;
      const alt = dist[current] + 1;
      if (alt < dist[nIdx]) {
        dist[nIdx] = alt;
        prev[nIdx] = current;
        queue.push(nIdx);
      }
    }
  }

  if (prev[endIdx] === -1 && endIdx !== startIdx) return [];
  const path = [];
  let cur = endIdx;
  while (cur !== -1) {
    path.push({
      x: cur % width,
      y: Math.floor(cur / width),
    });
    if (cur === startIdx) break;
    cur = prev[cur];
  }
  path.reverse();
  return path;
}
