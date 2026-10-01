const jwt = require('jsonwebtoken');
const logger = require('../logger');
const { getUserRole } = require('../redis');

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Токен не предоставлен' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const currentRole = await getUserRole(payload.id);
    req.user = {
      ...payload,
      role: currentRole || payload.role || 'viewer',
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Токен истёк' });
    }
    logger.warn('Invalid token attempt', { error: err.message });
    return res.status(401).json({ success: false, message: 'Недействительный токен' });
  }
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Не аутентифицирован' });
    }
    const currentRole = await getUserRole(req.user.id);
    const userRole = currentRole || req.user.role;
    req.user.role = userRole;

    if (!roles.includes(userRole)) {
      logger.warn('Forbidden access attempt', {
        userId: req.user.id,
        userRole,
        requiredRoles: roles,
        path: req.path,
      });
      return res.status(403).json({ success: false, message: 'Недостаточно прав' });
    }
    next();
  };
}

module.exports = { generateAccessToken, generateRefreshToken, authenticateToken, requireRole };
