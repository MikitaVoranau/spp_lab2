const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
} = require('../middleware/auth');
const { loginRateLimiter, checkBruteForce, recordLoginAttempt } = require('../middleware/bruteForce');
const { sendPasswordResetEmail } = require('../services/email');
const logger = require('../logger');

const router = express.Router();

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const RESET_TOKEN_EXPIRES_MINUTES = parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES || '30', 10);

router.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email и пароль обязательны' });
  }

  try {
    const locked = await checkBruteForce(ip, email);
    if (locked) {
      return res.status(429).json({
        success: false,
        message: `Аккаунт заблокирован из-за множества неудачных попыток. Попробуйте через 15 минут.`,
      });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !user.is_active) {
      await recordLoginAttempt(ip, email, false);
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordLoginAttempt(ip, email, false);
      logger.warn('Failed login attempt', { ip, email });
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }

    await recordLoginAttempt(ip, email, true);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );

    logger.info('User logged in', { userId: user.id, email: user.email, role: user.role, ip });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh токен не предоставлен' });
  }

  try {
    const jwt = require('jsonwebtoken');
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Недействительный refresh токен' });
    }

    const stored = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );

    if (stored.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Refresh токен не найден или истёк' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [payload.id]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'Пользователь не найден' });
    }

    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, newRefreshToken, expiresAt]
    );

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    logger.error('Refresh token error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
    logger.info('User logged out', { userId: req.user.id });
    res.status(200).json({ success: true, message: 'Выход выполнен' });
  } catch (err) {
    logger.error('Logout error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
    logger.info('User logged out from all devices', { userId: req.user.id });
    res.status(200).json({ success: true, message: 'Выход со всех устройств выполнен' });
  } catch (err) {
    logger.error('Logout-all error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, created_at, expires_at FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Sessions fetch error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email обязателен' });
  }

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    res.status(200).json({
      success: true,
      message: 'Если аккаунт существует, на него отправлено письмо с инструкциями.',
    });

    if (result.rows.length === 0) return;

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    await sendPasswordResetEmail(email, token);
    logger.info('Password reset requested', { email });
  } catch (err) {
    logger.error('Forgot-password error', { error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Токен и новый пароль обязательны' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Пароль должен быть не менее 8 символов' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Токен недействителен или истёк' });
    }

    const reset = result.rows[0];
    const hash = await bcrypt.hash(newPassword, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [reset.user_id]);

    logger.info('Password reset completed', { userId: reset.user_id });
    res.status(200).json({ success: true, message: 'Пароль успешно изменён' });
  } catch (err) {
    logger.error('Reset-password error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.status(200).json({
    success: true,
    data: { id: req.user.id, email: req.user.email, role: req.user.role },
  });
});

module.exports = router;
