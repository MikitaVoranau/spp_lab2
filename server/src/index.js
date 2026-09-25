const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./db');
const logger = require('./logger');
const { requestLogger, errorHandler } = require('./middleware/httpLogger');
const productsRouter = require('./routes/products');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(requestLogger);

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Маршрут не найден' });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await initDB();
      app.listen(PORT, () => {
        logger.info(`Server started on port ${PORT}`);
      });
    } catch (err) {
      logger.error('Server startup failed', { error: err.message });
      process.exit(1);
    }
  })();
}

module.exports = app;
