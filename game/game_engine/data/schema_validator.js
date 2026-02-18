function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function validateItems(data) {
  const errors = [];
  if (!Array.isArray(data)) {
    errors.push('items: se esperaba un array');
    return errors;
  }
  data.forEach((item, idx) => {
    if (!isObject(item)) {
      errors.push(`items[${idx}] no es objeto`);
      return;
    }
    if (!item.id) errors.push(`items[${idx}].id faltante`);
    if (!item.nombre) errors.push(`items[${idx}].nombre faltante`);
  });
  return errors;
}

export function validateEntities(data) {
  const errors = [];
  if (!isObject(data)) {
    errors.push('entities: se esperaba un objeto');
    return errors;
  }
  ['players', 'enemies', 'bots'].forEach((key) => {
    if (!Array.isArray(data[key])) errors.push(`entities.${key} debe ser array`);
  });
  return errors;
}

export function validateWorld(data) {
  const errors = [];
  if (!isObject(data)) {
    errors.push('world: se esperaba un objeto');
    return errors;
  }
  if (!Number.isFinite(data.width) || !Number.isFinite(data.height)) {
    errors.push('world: width/height invalidos');
  }
  if (!Array.isArray(data.map)) {
    errors.push('world: map debe ser array');
  }
  return errors;
}
