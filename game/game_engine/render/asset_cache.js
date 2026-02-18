export function ensureAssets(sceneEl, assets) {
  let assetsEl = sceneEl.querySelector('a-assets');
  if (!assetsEl) {
    assetsEl = document.createElement('a-assets');
    sceneEl.appendChild(assetsEl);
  }
  for (const asset of assets) {
    if (!asset?.id || !asset?.src) continue;
    if (assetsEl.querySelector(`#${asset.id}`)) continue;
    const item = document.createElement('a-asset-item');
    item.setAttribute('id', asset.id);
    item.setAttribute('src', asset.src);
    assetsEl.appendChild(item);
  }
  return assetsEl;
}
