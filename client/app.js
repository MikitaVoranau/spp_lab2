'use strict';

const API_BASE = '/api';

const tokenStorage = {
  getAccess() {
    return localStorage.getItem('accessToken');
  },
  getRefresh() {
    return localStorage.getItem('refreshToken');
  },
  set(access, refresh) {
    localStorage.setItem('accessToken', access);
    if (refresh) {
      localStorage.setItem('refreshToken', refresh);
    }
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
};

async function authFetch(url, options = {}) {
  const token = tokenStorage.getAccess();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && token) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${tokenStorage.getAccess()}`;
      res = await fetch(url, { ...options, headers });
    } else {
      tokenStorage.clear();
      showGuestMode();
      openLoginModal('login');
      throw new Error('Сессия истекла. Войдите снова.');
    }
  }

  return res;
}

async function tryRefreshToken() {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) {
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      return false;
    }
    const json = await res.json();
    if (json.success) {
      tokenStorage.set(json.data.accessToken, json.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const api = {
  async getAll() {
    const res = await authFetch(`${API_BASE}/products`);
    return res.json();
  },
  async create(formData) {
    const res = await authFetch(`${API_BASE}/products`, { method: 'POST', body: formData });
    return res.json();
  },
  async update(id, formData) {
    const res = await authFetch(`${API_BASE}/products/${id}`, { method: 'PUT', body: formData });
    return res.json();
  },
  async delete(id) {
    const res = await authFetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

const state = {
  products: [],
  filtered: [],
  editingId: null,
  deletingId: null,
  currentUser: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  loginScreen: $('login-screen'),
  loginModalTitle: $('login-modal-title'),
  btnCloseLogin: $('btn-close-login'),
  authTabsBar: $('auth-tabs-bar'),
  tabLogin: $('tab-login'),
  tabRegister: $('tab-register'),
  recoveryBackBar: $('recovery-back-bar'),
  btnBackToLoginTop: $('btn-back-to-login-top'),

  loginForm: $('login-form'),
  loginEmail: $('login-email'),
  loginPassword: $('login-password'),
  loginError: $('login-error'),
  linkForgotPassword: $('link-forgot-password'),

  registerForm: $('register-form'),
  registerEmail: $('register-email'),
  registerPassword: $('register-password'),
  registerError: $('register-error'),

  forgotFormContainer: $('forgot-form-container'),
  forgotInputStep: $('forgot-input-step'),
  forgotForm: $('forgot-form'),
  forgotEmail: $('forgot-email'),
  forgotError: $('forgot-error'),
  btnSubmitForgot: $('btn-submit-forgot'),
  btnShowEnterToken: $('btn-show-enter-token'),
  forgotSuccessCard: $('forgot-success-card'),
  forgotSuccessText: $('forgot-success-text'),
  btnCardEnterToken: $('btn-card-enter-token'),

  resetPasswordForm: $('reset-password-form'),
  resetBadgeUrl: $('reset-badge-url'),
  resetTokenGroup: $('reset-token-group'),
  resetTokenInput: $('reset-token-input'),
  resetNewPassword: $('reset-new-password'),
  resetError: $('reset-error'),
  resetInfo: $('reset-info'),
  btnSubmitNewPassword: $('btn-submit-new-password'),
  btnBackToForgot: $('btn-back-to-forgot'),
  btnResetToLogin: $('btn-reset-to-login'),



  mainApp: $('main-app'),
  userInfo: $('user-info'),
  btnOpenLogin: $('btn-open-login'),
  btnLogout: $('btn-logout'),
  btnManageUsers: $('btn-manage-users'),
  btnOpenCreate: $('btn-open-create'),

  notifications: $('notifications'),

  modalOverlay: $('modal-overlay'),
  modalTitle: $('modal-title'),
  btnCloseModal: $('btn-close-modal'),
  btnCancel: $('btn-cancel'),
  btnSubmit: $('btn-submit'),
  btnSubmitText: $('btn-submit-text'),
  productForm: $('product-form'),
  productId: $('product-id'),
  fieldName: $('field-name'),
  fieldPrice: $('field-price'),
  fieldCategory: $('field-category'),
  fieldDescription: $('field-description'),
  fieldImage: $('field-image'),
  imagePreview: $('image-preview'),
  formErrors: $('form-errors'),

  usersModalOverlay: $('users-modal-overlay'),
  btnCloseUsersModal: $('btn-close-users-modal'),
  usersLoading: $('users-loading'),
  usersTable: $('users-table'),
  usersBody: $('users-body'),

  searchInput: $('search-input'),
  count: $('count'),
  loading: $('loading'),
  emptyState: $('empty-state'),
  productsTable: $('products-table'),
  productsBody: $('products-body'),

  deleteOverlay: $('delete-overlay'),
  btnCancelDelete: $('btn-cancel-delete'),
  btnConfirmDelete: $('btn-confirm-delete'),
};

function showGuestMode() {
  state.currentUser = null;
  els.loginScreen.classList.add('hidden');
  els.userInfo.textContent = 'Гость (не авторизован)';
  els.btnOpenLogin.classList.remove('hidden');
  els.btnLogout.classList.add('hidden');
  els.btnOpenCreate.classList.add('hidden');
  els.btnManageUsers.classList.add('hidden');
}

function showMainApp(user) {
  state.currentUser = user;
  els.loginScreen.classList.add('hidden');
  els.userInfo.textContent = `${user.email} (${user.role})`;
  els.btnOpenLogin.classList.add('hidden');
  els.btnLogout.classList.remove('hidden');

  const canWrite = user.role === 'admin' || user.role === 'manager';
  els.btnOpenCreate.classList.toggle('hidden', !canWrite);
  els.btnManageUsers.classList.toggle('hidden', user.role !== 'admin');
}

function openLoginModal(tab = 'login') {
  els.loginScreen.classList.remove('hidden');
  els.loginError.classList.add('hidden');
  els.registerError.classList.add('hidden');
  els.forgotError.classList.add('hidden');
  els.resetError.classList.add('hidden');
  els.resetInfo.classList.add('hidden');

  if (tab === 'login') {
    els.loginModalTitle.textContent = 'Вход в систему';
    els.authTabsBar.classList.remove('hidden');
    els.recoveryBackBar.classList.add('hidden');
    els.tabLogin.classList.add('active');
    els.tabRegister.classList.remove('active');
    els.loginForm.classList.remove('hidden');
    els.registerForm.classList.add('hidden');
    els.forgotFormContainer.classList.add('hidden');
    els.resetPasswordForm.classList.add('hidden');
  } else if (tab === 'register') {
    els.loginModalTitle.textContent = 'Регистрация';
    els.authTabsBar.classList.remove('hidden');
    els.recoveryBackBar.classList.add('hidden');
    els.tabRegister.classList.add('active');
    els.tabLogin.classList.remove('active');
    els.registerForm.classList.remove('hidden');
    els.loginForm.classList.add('hidden');
    els.forgotFormContainer.classList.add('hidden');
    els.resetPasswordForm.classList.add('hidden');
  } else if (tab === 'forgot') {
    els.loginModalTitle.textContent = 'Восстановление пароля';
    els.authTabsBar.classList.add('hidden');
    els.recoveryBackBar.classList.remove('hidden');
    els.forgotFormContainer.classList.remove('hidden');
    els.forgotInputStep.classList.remove('hidden');
    els.forgotSuccessCard.classList.add('hidden');
    els.loginForm.classList.add('hidden');
    els.registerForm.classList.add('hidden');
    els.resetPasswordForm.classList.add('hidden');
    setTimeout(() => els.forgotEmail.focus(), 50);
  } else if (tab === 'reset') {
    els.loginModalTitle.textContent = 'Новый пароль';
    els.authTabsBar.classList.add('hidden');
    els.recoveryBackBar.classList.remove('hidden');
    els.resetPasswordForm.classList.remove('hidden');
    els.forgotFormContainer.classList.add('hidden');
    els.loginForm.classList.add('hidden');
    els.registerForm.classList.add('hidden');

    if (els.resetTokenInput.value.trim()) {
      els.resetBadgeUrl.classList.remove('hidden');
      els.resetTokenGroup.classList.add('hidden');
      setTimeout(() => els.resetNewPassword.focus(), 50);
    } else {
      els.resetBadgeUrl.classList.add('hidden');
      els.resetTokenGroup.classList.remove('hidden');
      setTimeout(() => els.resetTokenInput.focus(), 50);
    }
  }
}

function closeLoginModal() {
  els.loginScreen.classList.add('hidden');
  els.loginError.classList.add('hidden');
  els.registerError.classList.add('hidden');
  els.forgotError.classList.add('hidden');
  els.resetError.classList.add('hidden');
  els.resetInfo.classList.add('hidden');
}

els.btnOpenLogin.addEventListener('click', () => openLoginModal('login'));
els.btnCloseLogin.addEventListener('click', closeLoginModal);
els.loginScreen.addEventListener('click', (e) => {
  if (e.target === els.loginScreen) {
    closeLoginModal();
  }
});

els.tabLogin.addEventListener('click', () => openLoginModal('login'));
els.tabRegister.addEventListener('click', () => openLoginModal('register'));
els.linkForgotPassword.addEventListener('click', () => openLoginModal('forgot'));
els.btnBackToLoginTop.addEventListener('click', () => openLoginModal('login'));
els.btnShowEnterToken.addEventListener('click', () => openLoginModal('reset'));
els.btnCardEnterToken.addEventListener('click', () => openLoginModal('reset'));
els.btnBackToForgot.addEventListener('click', () => openLoginModal('forgot'));
els.btnResetToLogin.addEventListener('click', () => openLoginModal('login'));

els.forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.forgotError.classList.add('hidden');

  const email = els.forgotEmail.value.trim();
  if (!email) {
    els.forgotError.textContent = 'Введите ваш email';
    els.forgotError.classList.remove('hidden');
    return;
  }

  els.btnSubmitForgot.disabled = true;
  els.btnSubmitForgot.textContent = 'Отправка...';

  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();

    if (json.success) {
      els.forgotSuccessText.innerHTML = `Мы отправили письмо со ссылкой для сброса на <strong>${email}</strong>.<br />Проверьте почтовый ящик Mailpit:`;
      els.forgotInputStep.classList.add('hidden');
      els.forgotSuccessCard.classList.remove('hidden');
    } else {
      els.forgotError.textContent = json.message || 'Ошибка запроса сброса';
      els.forgotError.classList.remove('hidden');
    }
  } catch (err) {
    els.forgotError.textContent = 'Ошибка сети: ' + err.message;
    els.forgotError.classList.remove('hidden');
  } finally {
    els.btnSubmitForgot.disabled = false;
    els.btnSubmitForgot.textContent = 'Отправить письмо со ссылкой';
  }
});

els.resetPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.resetError.classList.add('hidden');
  els.resetInfo.classList.add('hidden');

  const token = els.resetTokenInput.value.trim();
  const newPassword = els.resetNewPassword.value;

  if (!token || !newPassword) {
    els.resetError.textContent = 'Заполните токен и новый пароль';
    els.resetError.classList.remove('hidden');
    return;
  }

  if (newPassword.length < 8) {
    els.resetError.textContent = 'Пароль должен быть не менее 8 символов';
    els.resetError.classList.remove('hidden');
    return;
  }

  els.btnSubmitNewPassword.disabled = true;
  els.btnSubmitNewPassword.textContent = 'Сохранение...';

  try {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const json = await res.json();

    if (json.success) {
      els.resetInfo.textContent = 'Пароль успешно изменён! Выполняем переход ко входу...';
      els.resetInfo.classList.remove('hidden');
      setTimeout(() => {
        openLoginModal('login');
      }, 1200);
    } else {
      els.resetError.textContent = json.message || 'Ошибка сброса пароля';
      els.resetError.classList.remove('hidden');
    }
  } catch (err) {
    els.resetError.textContent = 'Ошибка сети: ' + err.message;
    els.resetError.classList.remove('hidden');
  } finally {
    els.btnSubmitNewPassword.disabled = false;
    els.btnSubmitNewPassword.textContent = 'Сохранить новый пароль';
  }
});

els.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.registerError.classList.add('hidden');
  els.registerError.textContent = '';

  const email = els.registerEmail.value.trim();
  const password = els.registerPassword.value;

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (!json.success) {
      els.registerError.textContent = json.message || 'Ошибка регистрации';
      els.registerError.classList.remove('hidden');
      return;
    }

    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginJson = await loginRes.json();

    if (loginJson.success) {
      tokenStorage.set(loginJson.data.accessToken, loginJson.data.refreshToken);
      showMainApp(loginJson.data.user);
      closeLoginModal();
      showNotification('Регистрация успешна! Вы вошли в систему.', 'success');
      loadProducts();
    } else {
      showNotification('Регистрация успешна! Теперь вы можете войти.', 'success');
      openLoginModal('login');
      els.loginEmail.value = email;
      els.loginPassword.value = '';
    }
  } catch (err) {
    els.registerError.textContent = 'Ошибка сети: ' + err.message;
    els.registerError.classList.remove('hidden');
  }
});

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.classList.add('hidden');
  els.loginError.textContent = '';

  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (!json.success) {
      els.loginError.textContent = json.message || 'Ошибка входа';
      els.loginError.classList.remove('hidden');
      return;
    }

    tokenStorage.set(json.data.accessToken, json.data.refreshToken);
    showMainApp(json.data.user);
    closeLoginModal();
    showNotification('Успешный вход в систему!', 'success');
    loadProducts();
  } catch (err) {
    els.loginError.textContent = 'Ошибка сети: ' + err.message;
    els.loginError.classList.remove('hidden');
  }
});

els.btnLogout.addEventListener('click', async () => {
  try {
    await authFetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenStorage.getRefresh() }),
    });
  } catch {}
  tokenStorage.clear();
  showGuestMode();
  showNotification('Вы вышли из системы.', 'info');
  loadProducts();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadUsers() {
  els.usersLoading.classList.remove('hidden');
  els.usersTable.classList.add('hidden');
  try {
    const res = await authFetch(`${API_BASE}/auth/users`);
    const json = await res.json();
    if (!json.success) {
      showNotification(json.message || 'Ошибка загрузки пользователей', 'error');
      return;
    }
    renderUsers(json.data);
  } catch (err) {
    showNotification('Не удалось загрузить пользователей: ' + err.message, 'error');
  } finally {
    els.usersLoading.classList.add('hidden');
  }
}

function renderUsers(users) {
  els.usersBody.innerHTML = '';
  users.forEach((user) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${user.id}</td>
      <td><strong>${escapeHtml(user.email)}</strong></td>
      <td><span class="role-badge role-${user.role}">${user.role}</span></td>
      <td>
        <select class="role-select" id="role-select-${user.id}">
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>manager</option>
          <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>viewer</option>
        </select>
      </td>
      <td>
        <button type="button" class="btn btn-primary btn-save-role" data-id="${user.id}">Назначить</button>
      </td>
    `;
    els.usersBody.appendChild(tr);
  });
  els.usersTable.classList.remove('hidden');
}

els.usersBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-save-role');
  if (!btn) {
    return;
  }
  const userId = btn.dataset.id;
  const select = $(`role-select-${userId}`);
  const newRole = select.value;

  btn.disabled = true;
  try {
    const res = await authFetch(`${API_BASE}/auth/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    const json = await res.json();
    if (!json.success) {
      showNotification(json.message || 'Ошибка изменения роли', 'error');
      return;
    }
    showNotification(`Роль пользователя #${userId} успешно изменена на ${newRole} в Redis!`, 'success');
    await loadUsers();
    if (state.currentUser && state.currentUser.id === parseInt(userId, 10)) {
      state.currentUser.role = newRole;
      showMainApp(state.currentUser);
      loadProducts();
    }
  } catch (err) {
    showNotification('Ошибка сети: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

els.btnManageUsers.addEventListener('click', () => {
  els.usersModalOverlay.classList.remove('hidden');
  loadUsers();
});

els.btnCloseUsersModal.addEventListener('click', () => {
  els.usersModalOverlay.classList.add('hidden');
});

els.usersModalOverlay.addEventListener('click', (e) => {
  if (e.target === els.usersModalOverlay) {
    els.usersModalOverlay.classList.add('hidden');
  }
});

function showNotification(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `notification notification--${type}`;
  el.textContent = message;
  els.notifications.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function renderProducts(products) {
  els.count.textContent = products.length;
  els.emptyState.classList.toggle('hidden', products.length > 0);
  els.productsTable.classList.toggle('hidden', products.length === 0);
  els.productsBody.innerHTML = '';

  const canWrite = state.currentUser?.role === 'admin' || state.currentUser?.role === 'manager';
  const canDelete = state.currentUser?.role === 'admin';

  products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.id = `product-row-${p.id}`;

    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" class="product-thumb" />`
      : `<span class="no-img">—</span>`;

    let actionsHtml = '—';
    if (canWrite || canDelete) {
      actionsHtml = `
        <div class="actions">
          ${canWrite ? `<button class="btn btn-edit" onclick="openEditModal(${p.id})">Ред.</button>` : ''}
          ${canDelete ? `<button class="btn btn-danger btn-del" onclick="openDeleteModal(${p.id})">Уд.</button>` : ''}
        </div>
      `;
    }

    tr.innerHTML = `
      <td>${imgHtml}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><span class="badge">${escapeHtml(p.category || 'Без категории')}</span></td>
      <td class="price">${formatPrice(p.price)}</td>
      <td class="desc">${escapeHtml(p.description || '')}</td>
      <td>${actionsHtml}</td>
    `;

    els.productsBody.appendChild(tr);
  });
}

function formatPrice(val) {
  return parseFloat(val).toLocaleString('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  });
}

async function loadProducts() {
  els.loading.classList.remove('hidden');
  els.productsTable.classList.add('hidden');
  els.emptyState.classList.add('hidden');

  try {
    const res = await api.getAll();
    if (res.success) {
      state.products = res.data;
      state.filtered = res.data;
      renderProducts(state.filtered);
    } else {
      showNotification(res.message || 'Ошибка загрузки продуктов', 'error');
    }
  } catch (err) {
    showNotification('Ошибка сети: ' + err.message, 'error');
  } finally {
    els.loading.classList.add('hidden');
  }
}

function applyFilter() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) {
    state.filtered = state.products;
  } else {
    state.filtered = state.products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query))
    );
  }
  renderProducts(state.filtered);
}

function openCreateModal() {
  state.editingId = null;
  els.modalTitle.textContent = 'Новый продукт';
  els.btnSubmitText.textContent = 'Создать';
  els.productForm.reset();
  els.productId.value = '';
  els.imagePreview.src = '';
  els.imagePreview.classList.add('hidden');
  els.formErrors.classList.add('hidden');
  els.formErrors.innerHTML = '';
  els.modalOverlay.classList.remove('hidden');
  els.fieldName.focus();
}

function openEditModal(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    return;
  }

  state.editingId = id;
  els.modalTitle.textContent = 'Редактировать продукт';
  els.btnSubmitText.textContent = 'Сохранить';
  els.formErrors.classList.add('hidden');
  els.formErrors.innerHTML = '';

  els.productId.value = product.id;
  els.fieldName.value = product.name;
  els.fieldPrice.value = product.price;
  els.fieldCategory.value = product.category || '';
  els.fieldDescription.value = product.description || '';
  els.fieldImage.value = '';

  if (product.image_url) {
    els.imagePreview.src = product.image_url;
    els.imagePreview.classList.remove('hidden');
  } else {
    els.imagePreview.src = '';
    els.imagePreview.classList.add('hidden');
  }

  els.modalOverlay.classList.remove('hidden');
  els.fieldName.focus();
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  state.editingId = null;
}

function openDeleteModal(id) {
  state.deletingId = id;
  els.deleteOverlay.classList.remove('hidden');
}

function closeDeleteModal() {
  els.deleteOverlay.classList.add('hidden');
  state.deletingId = null;
}

function validateForm(formData) {
  const errors = [];
  const name = formData.get('name')?.trim();
  const price = formData.get('price');
  const image = formData.get('image');

  if (!name) {
    errors.push('Поле "Название" обязательно для заполнения');
  } else if (name.length > 255) {
    errors.push('Название не должно превышать 255 символов');
  }

  if (price === '' || price === null || isNaN(price)) {
    errors.push('Поле "Цена" обязательно для заполнения');
  } else if (parseFloat(price) < 0) {
    errors.push('Цена не может быть отрицательной');
  }

  if (image && image.size > 0) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(image.type)) {
      errors.push('Допустимы только форматы JPEG, PNG, GIF, WEBP');
    }
    if (image.size > 5 * 1024 * 1024) {
      errors.push('Размер файла не должен превышать 5 МБ');
    }
  }

  return errors;
}

function showFormErrors(errors) {
  const ul = document.createElement('ul');
  errors.forEach((e) => {
    const li = document.createElement('li');
    li.textContent = e;
    ul.appendChild(li);
  });
  els.formErrors.innerHTML = '';
  els.formErrors.appendChild(ul);
  els.formErrors.classList.remove('hidden');
}

els.productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.formErrors.classList.add('hidden');

  const formData = new FormData(els.productForm);
  if (!formData.get('name') && els.fieldName.value) {
    formData.set('name', els.fieldName.value.trim());
  }
  if (!formData.get('price') && els.fieldPrice.value) {
    formData.set('price', els.fieldPrice.value);
  }
  if (!formData.get('category') && els.fieldCategory.value) {
    formData.set('category', els.fieldCategory.value.trim());
  }
  if (!formData.get('description') && els.fieldDescription.value) {
    formData.set('description', els.fieldDescription.value.trim());
  }
  if (els.fieldImage.files[0] && !formData.get('image')) {
    formData.set('image', els.fieldImage.files[0]);
  }

  const errors = validateForm(formData);

  if (errors.length > 0) {
    showFormErrors(errors);
    return;
  }

  els.btnSubmit.disabled = true;
  els.btnSubmitText.textContent = 'Сохранение...';

  try {
    let res;
    if (state.editingId) {
      res = await api.update(state.editingId, formData);
    } else {
      res = await api.create(formData);
    }

    if (res.success) {
      closeModal();
      showNotification(
        state.editingId ? 'Продукт успешно обновлён' : 'Продукт успешно создан',
        'success'
      );
      await loadProducts();
    } else {
      const errs = res.errors && res.errors.length ? res.errors : [res.message || 'Ошибка сохранения'];
      showFormErrors(errs);
    }

  } catch (err) {
    showFormErrors(['Ошибка сети: ' + err.message]);
  } finally {
    els.btnSubmit.disabled = false;
    els.btnSubmitText.textContent = state.editingId ? 'Сохранить' : 'Создать';
  }
});

els.btnConfirmDelete.addEventListener('click', async () => {
  if (!state.deletingId) {
    return;
  }

  els.btnConfirmDelete.disabled = true;
  els.btnConfirmDelete.textContent = 'Удаление...';

  try {
    const res = await api.delete(state.deletingId);
    if (res.success) {
      closeDeleteModal();
      showNotification('Продукт успешно удалён', 'success');
      await loadProducts();
    } else {
      showNotification(res.message || 'Ошибка удаления', 'error');
    }
  } catch (err) {
    showNotification('Ошибка сети: ' + err.message, 'error');
  } finally {
    els.btnConfirmDelete.disabled = false;
    els.btnConfirmDelete.textContent = 'Удалить';
  }
});

els.fieldImage.addEventListener('change', () => {
  const file = els.fieldImage.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    els.imagePreview.src = e.target.result;
    els.imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

els.btnOpenCreate.addEventListener('click', openCreateModal);
els.btnCloseModal.addEventListener('click', closeModal);
els.btnCancel.addEventListener('click', closeModal);
els.modalOverlay.addEventListener('click', (e) => {
  if (e.target === els.modalOverlay) {
    closeModal();
  }
});
els.btnCancelDelete.addEventListener('click', closeDeleteModal);
els.deleteOverlay.addEventListener('click', (e) => {
  if (e.target === els.deleteOverlay) {
    closeDeleteModal();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeDeleteModal();
    closeLoginModal();
    els.usersModalOverlay.classList.add('hidden');
  }
});
els.searchInput.addEventListener('input', applyFilter);

window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;

async function init() {
  loadProducts();
  const urlParams = new URLSearchParams(window.location.search);
  const resetTokenParam = urlParams.get('token') || urlParams.get('resetToken');
  if (resetTokenParam) {
    els.resetTokenInput.value = resetTokenParam;
    openLoginModal('reset');
  }
  const token = tokenStorage.getAccess();
  if (!token) {
    showGuestMode();
    return;
  }
  try {
    const res = await authFetch(`${API_BASE}/auth/me`);
    const json = await res.json();
    if (json.success) {
      showMainApp(json.data);
    } else {
      tokenStorage.clear();
      showGuestMode();
    }
  } catch {
    tokenStorage.clear();
    showGuestMode();
  }
}

init();
