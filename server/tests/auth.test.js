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
  test('should return 401 without token', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/products/:id', () => {
  test('should return 403 for viewer role', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 1, email: 'v@t.com', role: 'viewer' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /health', () => {
  test('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('404 handler', () => {
  test('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
