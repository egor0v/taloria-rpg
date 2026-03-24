const { v4: uuidv4 } = require('uuid');
const logger = require('../services/logger');
const config = require('../config');

function errorHandler(err, req, res, _next) {
  const requestId = req.headers['x-request-id'] || uuidv4();

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
    return res.status(400).json({ error: 'Validation error', requestId, details });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
    return res.status(409).json({ error: `Duplicate value for field: ${field}`, requestId });
  }

  // Zod errors (if thrown instead of using middleware)
  if (err.name === 'ZodError') {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({ error: 'Validation failed', requestId, details });
  }

  // Custom app errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message, requestId });
  }

  // Unexpected errors
  logger.error('Unhandled error', {
    requestId,
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  const message = config.isDev ? err.message : 'Internal server error';
  res.status(500).json({ error: message, requestId });
}

module.exports = errorHandler;
