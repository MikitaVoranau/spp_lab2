const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const upload = require('../middleware/upload');
const { validateCreateProduct, validateUpdateProduct } = require('../middleware/validate');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.status(200).json({ success: true, data: result.rows });
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Продукт не найден' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'manager'),
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  validateCreateProduct,
  async (req, res) => {
    try {
      const { name, description, price, category } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const result = await pool.query(
        `INSERT INTO products (name, description, price, category, image_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name.trim(), description || null, parseFloat(price), category || null, imageUrl]
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (_err) {
      res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'manager'),
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  validateUpdateProduct,
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Продукт не найден' });
      }

      const current = existing.rows[0];
      const name = req.body.name?.trim() ?? current.name;
      const description = req.body.description ?? current.description;
      const price = req.body.price !== undefined ? parseFloat(req.body.price) : current.price;
      const category = req.body.category ?? current.category;

      let imageUrl = current.image_url;
      if (req.file) {
        if (current.image_url) {
          const oldPath = path.join(__dirname, '..', 'uploads', path.basename(current.image_url));
          fs.unlink(oldPath, () => {});
        }
        imageUrl = `/uploads/${req.file.filename}`;
      }

      const result = await pool.query(
        `UPDATE products SET name=$1, description=$2, price=$3, category=$4, image_url=$5, updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [name, description, price, category, imageUrl, id]
      );

      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (_err) {
      res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
  }
);

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Продукт не найден' });
    }

    const product = existing.rows[0];
    await pool.query('DELETE FROM products WHERE id = $1', [id]);

    if (product.image_url) {
      const filePath = path.join(__dirname, '..', 'uploads', path.basename(product.image_url));
      fs.unlink(filePath, () => {});
    }

    res.status(200).json({ success: true, message: 'Продукт успешно удалён' });
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
