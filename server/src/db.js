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
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS products (
      id        SERIAL PRIMARY KEY,
      name      VARCHAR(255) NOT NULL,
      description TEXT,
      price     NUMERIC(10, 2) NOT NULL,
      category  VARCHAR(100),
      image_url VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  console.log('Database table "products" is ready');
}

module.exports = { pool, initDB };
