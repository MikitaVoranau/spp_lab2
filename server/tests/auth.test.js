const request = require('supertest');

jest.mock('../src/db', () => ({
  pool: { query: jest.fn() },
  initDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../src/redis', () => ({
  getUserRole: jest.fn((userId) => {
    if (userId === 1) {
      return Promise.resolve('admin');
    }
    if (userId === 2) {
      return Promise.resolve('manager');
    }
    return Promise.resolve('viewer');
  }),
  setUserRole: jest.fn().mockResolvedValue(undefined),
  initRedisRoles: jest.fn().mockResolvedValue(undefined),
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/middleware/bruteForce', () => ({
  loginRateLimiter: (req, res, next) => next(),
  checkBruteForce: jest.fn().mockResolvedValue(false),
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

process.env.JWT_SECRET = 'test_secret_key_for_tests_only_32ch';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

const app = require('../src/index');
const { pool } = require('../src/db');
const { getUserRole, setUserRole } = require('../src/redis');
const bcrypt = require('bcryptjs');

describe('POST /api/auth/login', () => {
  afterEach(() => jest.clearAllMocks());

  test('should return 400 if email or password missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should return 401 for non-existent user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@test.com', password: 'pass' });

    expect(res.statusCode).toBe(401);
  });

  test('should return 401 for wrong password', async () => {
    const hash = await bcrypt.hash('correctpass', 1);
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'u@t.com', password_hash: hash, role: 'viewer', is_active: true }] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'u@t.com', password: 'wrongpass' });

    expect(res.statusCode).toBe(401);
  });

  test('should return tokens on successful login', async () => {
    const hash = await bcrypt.hash('correctpass', 1);
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'u@t.com', password_hash: hash, role: 'admin', is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'u@t.com', password: 'correctpass' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });
});

describe('GET /api/auth/me', () => {
  test('should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/products', () => {
  test('should return 200 for guest or authorized user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Item 1' }] });
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/products', () => {
  test('should return 401 without token', async () => {
    const res = await request(app).post('/api/products').send({ name: 'Test' });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/products/:id', () => {
  test('should return 401 without token', async () => {
    const res = await request(app).delete('/api/products/1');
    expect(res.statusCode).toBe(401);
  });

  test('should return 403 for viewer role', async () => {
    getUserRole.mockResolvedValueOnce('viewer');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 3, email: 'v@t.com', role: 'viewer' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });
});


describe('PUT /api/auth/users/:id/role', () => {
  test('should update role in redis when admin', async () => {
    getUserRole.mockResolvedValueOnce('admin');
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 1, email: 'admin@t.com', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .put('/api/auth/users/2/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'manager' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(setUserRole).toHaveBeenCalledWith(2, 'manager');
  });
});

describe('POST /api/auth/register', () => {
  test('should return 400 if fields invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should return 201 on successful registration', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, email: 'new@test.com', role: 'viewer' }] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'Password123!' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(setUserRole).toHaveBeenCalledWith(4, 'viewer');
  });
});

describe('GET /api/auth/users', () => {
  test('should return 403 for viewer', async () => {
    getUserRole.mockResolvedValueOnce('viewer');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 3, email: 'v@t.com', role: 'viewer' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });

  test('should return 200 and list of users for admin', async () => {
    getUserRole.mockResolvedValueOnce('admin').mockResolvedValueOnce('admin').mockResolvedValueOnce('viewer');
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'admin@t.com', role: 'admin', is_active: true, created_at: new Date() },
        { id: 2, email: 'viewer@t.com', role: 'viewer', is_active: true, created_at: new Date() },
      ],
    });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 1, email: 'admin@t.com', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /health', () => {
  test('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/auth/forgot-password', () => {
  test('should return 400 if email is missing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should return 200 for existing user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'user@t.com' }] });
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@t.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/auth/reset-password', () => {
  test('should return 400 if token or password missing', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({});
    expect(res.statusCode).toBe(400);
  });

  test('should return 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc', newPassword: '123' });
    expect(res.statusCode).toBe(400);
  });

  test('should return 200 on valid reset', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 2, token: 'validtoken', expires_at: new Date(Date.now() + 60000) }],
    });
    pool.query.mockResolvedValueOnce({});
    pool.query.mockResolvedValueOnce({});
    pool.query.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'validtoken', newPassword: 'newStrongPassword123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('404 handler', () => {
  test('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

