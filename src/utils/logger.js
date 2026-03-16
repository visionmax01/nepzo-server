const levels = ['error', 'warn', 'info', 'debug'];

const currentLevel = process.env.LOG_LEVEL || 'info';

const shouldLog = (level) => levels.indexOf(level) <= levels.indexOf(currentLevel);

export const logger = {
  error: (msg, err) => {
    if (!shouldLog('error')) return;
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${msg}`, err ?? '');
  },
  warn: (msg, meta) => {
    if (!shouldLog('warn')) return;
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${msg}`, meta ?? '');
  },
  info: (msg, meta) => {
    if (!shouldLog('info')) return;
    // eslint-disable-next-line no-console
    console.info(`[INFO] ${msg}`, meta ?? '');
  },
  debug: (msg, meta) => {
    if (!shouldLog('debug')) return;
    // eslint-disable-next-line no-console
    console.debug(`[DEBUG] ${msg}`, meta ?? '');
  },
};

