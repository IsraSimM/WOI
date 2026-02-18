export function createCullingSystem({ cameraEl, maxDistance = 60 } = {}) {
  const maxDistSq = maxDistance * maxDistance;
  const camWorld = window.THREE ? new THREE.Vector3() : null;
  const objWorld = window.THREE ? new THREE.Vector3() : null;

  function getWorld(el, target) {
    if (!el?.object3D) return null;
    if (target && el.object3D.getWorldPosition) {
      el.object3D.getWorldPosition(target);
      return target;
    }
    return el.object3D.position || null;
  }

  function update(entities) {
    if (!cameraEl) return;
    const camPos = getWorld(cameraEl, camWorld);
    if (!camPos) return;
    entities.forEach((el) => {
      if (!el?.object3D) return;
      const pos = getWorld(el, objWorld) || el.object3D.position;
      const dx = pos.x - camPos.x;
      const dz = pos.z - camPos.z;
      const distSq = dx * dx + dz * dz;
      el.setAttribute('visible', distSq <= maxDistSq);
    });
  }
  return { update };
}
