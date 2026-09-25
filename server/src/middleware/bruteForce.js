const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const logger = require('../logger');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded on login', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    });
  },
});

async function checkBruteForce(ip, email) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);

  const result = await pool.query(
    `SELECT COUNT(*) FROM login_attempts
     WHERE ip = $1 AND success = FALSE AND created_at > $2`,
    [ip, since]
  );

  const failCount = parseInt(result.rows[0].count, 10);

  if (failCount >= LOCKOUT_THRESHOLD) {
    logger.warn('Brute-force lockout triggered', { ip, email, failCount });
    return true;
  }

  return false;
}

async function recordLoginAttempt(ip, email, success) {
  await pool.query(
    `INSERT INTO login_attempts (ip, email, success) VALUES ($1, $2, $3)`,
    [ip, email, success]
  );
}

module.exports = { loginRateLimiter, checkBruteForce, recordLoginAttempt };
