const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let current = LEVELS.info;
let enabled = true;

export function setLevel(level) {
  if (LEVELS[level] === undefined) return;
  current = LEVELS[level];
}

export function setEnabled(flag) {
  enabled = Boolean(flag);
}

function log(level, ...args) {
  if (!enabled) return;
  if (LEVELS[level] < current) return;
  const fn = level === 'debug' ? console.debug : console[level] || console.log;
  fn(`[${level}]`, ...args);
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
