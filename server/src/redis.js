const Redis = require('ioredis');
const logger = require('./logger');
const { pool } = require('./db');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redisClient.on('error', (err) => {
  logger.warn('Redis connection issue', { error: err.message });
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

async function getUserRole(userId) {
  if (!userId) {
    return null;
  }
  const key = `user:${userId}:role`;
  try {
    if (redisClient.status === 'ready' || redisClient.status === 'connect') {
      const cachedRole = await redisClient.get(key);
      if (cachedRole) {
        return cachedRole;
      }
    }
  } catch (err) {
    logger.warn('Redis get error, falling back to database', { error: err.message, userId });
  }

  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return null;
    }
    const role = result.rows[0].role;
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        await redisClient.set(key, role);
      }
    } catch (_setErr) {
      logger.warn('Redis set error', { error: _setErr.message, userId });
    }
    return role;
  } catch (dbErr) {
    logger.error('Database role query error', { error: dbErr.message, userId });
    return null;
  }
}

async function setUserRole(userId, role) {
  const key = `user:${userId}:role`;
  try {
    if (redisClient.status === 'ready' || redisClient.status === 'connect') {
      await redisClient.set(key, role);
    }
  } catch (err) {
    logger.warn('Redis set role error', { error: err.message, userId, role });
  }
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
}

async function initRedisRoles() {
  try {
    if (redisClient.status === 'wait') {
      await redisClient.connect();
    }
    const result = await pool.query('SELECT id, role FROM users');
    const pipeline = redisClient.pipeline();
    for (const row of result.rows) {
      pipeline.set(`user:${row.id}:role`, row.role);
    }
    await pipeline.exec();
    logger.info('Redis user roles successfully initialized', { count: result.rows.length });
  } catch (err) {
    logger.warn('Failed to populate Redis user roles during startup', { error: err.message });
  }
}

module.exports = {
  redisClient,
  getUserRole,
  setUserRole,
  initRedisRoles,
};
