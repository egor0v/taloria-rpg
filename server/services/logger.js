const { createLogger, format, transports } = require('winston');
const config = require('../config');

const logger = createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    config.isDev
      ? format.combine(format.colorize(), format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${stack || message}${metaStr}`;
        }))
      : format.json()
  ),
  defaultMeta: { service: 'taloria' },
  transports: [new transports.Console()],
});

module.exports = logger;
