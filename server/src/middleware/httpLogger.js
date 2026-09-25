const logger = require('../logger');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
    });
  });

  next();
}

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const message = status === 500 ? 'Внутренняя ошибка сервера' : err.message;

  logger.error('Unhandled error', {
    status,
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    user_id: req.user?.id || null,
  });

  res.status(status).json({ success: false, message });
}

module.exports = { requestLogger, errorHandler };
