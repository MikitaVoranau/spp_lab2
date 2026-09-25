const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      description TEXT,
      price       NUMERIC(10, 2) NOT NULL,
      category    VARCHAR(100),
      image_url   VARCHAR(500),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role          VARCHAR(20) NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'manager', 'viewer')),
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      VARCHAR(512) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id         SERIAL PRIMARY KEY,
      ip         VARCHAR(64) NOT NULL,
      email      VARCHAR(255),
      success    BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const bcrypt = require('bcryptjs');
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@example.com']);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('Admin1234!', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')`,
      ['admin@example.com', hash]
    );

    const managerHash = await bcrypt.hash('Manager123!', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'manager')`,
      ['manager@example.com', managerHash]
    );

    const viewerHash = await bcrypt.hash('Viewer1234!', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'viewer')`,
      ['viewer@example.com', viewerHash]
    );
  }

  const logger = require('./logger');
  logger.info('Database tables are ready');
}

module.exports = { pool, initDB };
