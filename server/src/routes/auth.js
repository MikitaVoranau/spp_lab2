const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
  requireRole,
} = require('../middleware/auth');
const { loginRateLimiter, checkBruteForce, recordLoginAttempt } = require('../middleware/bruteForce');
const { sendPasswordResetEmail } = require('../services/email');
const { getUserRole, setUserRole } = require('../redis');
const logger = require('../logger');

const router = express.Router();

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const RESET_TOKEN_EXPIRES_MINUTES = parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES || '30', 10);

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email и пароль обязательны' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Пароль должен быть не менее 8 символов' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, hash, 'viewer']
    );
    const newUser = result.rows[0];

    await setUserRole(newUser.id, 'viewer');
    logger.info('New user registered', { userId: newUser.id, email: newUser.email, role: 'viewer' });

    res.status(201).json({
      success: true,
      message: 'Пользователь успешно зарегистрирован',
      data: { id: newUser.id, email: newUser.email, role: 'viewer' },
    });
  } catch (err) {
    logger.error('Registration error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

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
        message: 'Аккаунт заблокирован из-за множества неудачных попыток. Попробуйте через 15 минут.',
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

    const redisRole = await getUserRole(user.id);
    const userRole = redisRole || user.role;

    const accessToken = generateAccessToken({ ...user, role: userRole });
    const refreshToken = generateRefreshToken(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );

    logger.info('User logged in', { userId: user.id, email: user.email, role: userRole, ip });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, role: userRole },
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

    const redisRole = await getUserRole(user.id);
    const userRole = redisRole || user.role;

    const newAccessToken = generateAccessToken({ ...user, role: userRole });
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
    let token = null;

    if (result.rows.length > 0) {
      const user = result.rows[0];
      token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

      await pool.query(
        `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, token, expiresAt]
      );

      await sendPasswordResetEmail(email, token);
      logger.info('Password reset requested', { email });
    }

    res.status(200).json({
      success: true,
      message: 'Если аккаунт существует, ссылка для восстановления отправлена.',
      resetToken: token,
    });
  } catch (err) {
    logger.error('Forgot-password error', { error: err.message });
    res.status(500).json({ success: false, message: 'Ошибка при обработке запроса' });
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

router.get('/me', authenticateToken, async (req, res) => {
  const role = await getUserRole(req.user.id);
  res.status(200).json({
    success: true,
    data: { id: req.user.id, email: req.user.email, role: role || req.user.role },
  });
});

router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, role, is_active, created_at FROM users ORDER BY id ASC');
    const usersWithRoles = await Promise.all(
      result.rows.map(async (u) => {
        const redisRole = await getUserRole(u.id);
        return {
          id: u.id,
          email: u.email,
          role: redisRole || u.role,
          is_active: u.is_active,
          created_at: u.created_at,
        };
      })
    );
    res.status(200).json({ success: true, data: usersWithRoles });
  } catch (err) {
    logger.error('Get users error', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.put('/users/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['admin', 'manager', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Некорректная роль' });
  }

  try {
    const userRes = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    await setUserRole(parseInt(id, 10), role);
    logger.info('User role updated in Redis', { targetUserId: id, newRole: role, updatedBy: req.user.id });
    res.status(200).json({ success: true, message: 'Роль успешно обновлена в Redis' });
  } catch (err) {
    logger.error('Failed to update user role', { error: err.message });
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
