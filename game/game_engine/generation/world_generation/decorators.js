export function applyPacmanize(generator, { openBorders = false, protectGoals = true } = {}) {
  if (!generator) return null;
  return generator.pacmanizeMap({ openBorders, protectGoals });
}

export function applyBorders(generator, { openBorders = false } = {}) {
  if (!generator) return null;
  if (openBorders) return generator.openBorders();
  generator.regenerateBorders();
  return generator.getMap2DView();
}

export function applyGoals(generator, { markCells = true } = {}) {
  if (!generator) return null;
  return generator.autoPlaceGoals({ markCells });
}
