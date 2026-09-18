function validateCreateProduct(req, res, next) {
  const { name, price } = req.body;
  const errors = [];

  if (!name || name.toString().trim() === '') {
    errors.push('Поле "name" обязательно и не может быть пустым');
  } else if (name.trim().length > 255) {
    errors.push('Поле "name" не может быть длиннее 255 символов');
  }

  if (price === undefined || price === null || price === '') {
    errors.push('Поле "price" обязательно');
  } else {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) {
      errors.push('Поле "price" должно быть числом');
    } else if (priceNum < 0) {
      errors.push('Поле "price" не может быть отрицательным');
    }
  }

  if (req.body.category && req.body.category.length > 100) {
    errors.push('Поле "category" не может быть длиннее 100 символов');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Ошибка валидации',
      errors: errors,
    });
  }

  next();
}

function validateUpdateProduct(req, res, next) {
  const { name, price, category } = req.body;
  const errors = [];

  if (name !== undefined) {
    if (name.toString().trim() === '') {
      errors.push('Поле "name" не может быть пустым');
    } else if (name.trim().length > 255) {
      errors.push('Поле "name" не может быть длиннее 255 символов');
    }
  }

  if (price !== undefined) {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) {
      errors.push('Поле "price" должно быть числом');
    } else if (priceNum < 0) {
      errors.push('Поле "price" не может быть отрицательным');
    }
  }

  if (category !== undefined && category.length > 100) {
    errors.push('Поле "category" не может быть длиннее 100 символов');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Ошибка валидации',
      errors: errors,
    });
  }

  next();
}

module.exports = { validateCreateProduct, validateUpdateProduct };
