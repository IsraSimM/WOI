export function createCombatSystem({
  playerEl,
  cameraEl,
  enemies,
  cellSize,
  onKill,
}) {
  const camDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toEnemy = new THREE.Vector3();

  const range = Math.max(0.5, cellSize * 1.05);
  const coneCos = Math.cos(Math.PI * 0.45);

  function getForwardDir() {
    forward.set(0, 0, -1);
    const camRef = cameraEl || playerEl?.querySelector?.('[camera]');
    if (camRef?.object3D?.getWorldDirection) {
      camRef.object3D.getWorldDirection(camDir);
      forward.copy(camDir);
      forward.y = 0;
      if (forward.lengthSq() > 0) {
        forward.normalize().multiplyScalar(-1);
        return forward;
      }
    }
    return forward;
  }

  function meleeAttack() {
    if (!playerEl || !Array.isArray(enemies)) return 0;
    const origin = playerEl.object3D.position;
    const dir = getForwardDir();
    if (dir.lengthSq() === 0) return 0;

    let kills = 0;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      if (!enemy?.el) continue;
      const pos = enemy.el.object3D.position;
      toEnemy.set(pos.x - origin.x, 0, pos.z - origin.z);
      const dist = toEnemy.length();
      const hitRadius = Number(enemy.hitRadius) || cellSize * 0.25;
      if (dist > range + hitRadius || dist <= 0.0001) continue;
      toEnemy.divideScalar(dist);
      const dot = toEnemy.dot(dir);
      if (dot < coneCos) continue;
      if (typeof onKill === 'function') onKill(enemy);
      kills += 1;
    }
    return kills;
  }

  return { meleeAttack };
}
