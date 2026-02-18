const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const itemsPath = path.join(root, 'game', 'game_data', 'items', 'latest.json');

function exists(relPath) {
  const full = path.join(root, relPath);
  return fs.existsSync(full);
}

function main() {
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
  let missing = 0;
  items.forEach((item) => {
    if (!item.asset) return;
    if (!exists(item.asset)) {
      missing++;
      console.warn(`[missing] ${item.id}: ${item.asset}`);
    }
  });

  if (missing === 0) {
    console.log('Todos los assets existen.');
  } else {
    console.log(`Faltan ${missing} assets.`);
    process.exitCode = 1;
  }
}

main();
