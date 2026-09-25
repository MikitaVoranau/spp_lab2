'use strict';

const API_BASE = '/api';

const tokenStorage = {
  getAccess() { return localStorage.getItem('accessToken'); },
  getRefresh() { return localStorage.getItem('refreshToken'); },
  set(access, refresh) {
    localStorage.setItem('accessToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
};

async function authFetch(url, options = {}) {
  const token = tokenStorage.getAccess();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${tokenStorage.getAccess()}`;
      res = await fetch(url, { ...options, headers });
    } else {
      showLoginScreen();
      throw new Error('Сессия истекла. Войдите снова.');
    }
  }

  return res;
}

async function tryRefreshToken() {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
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
  mainApp: $('main-app'),
  loginForm: $('login-form'),
  loginEmail: $('login-email'),
  loginPassword: $('login-password'),
  loginError: $('login-error'),
  btnLogout: $('btn-logout'),
  userInfo: $('user-info'),

  btnOpenCreate: $('btn-open-create'),
  btnCloseModal: $('btn-close-modal'),
  btnCancel: $('btn-cancel'),
  btnSubmit: $('btn-submit'),
  btnSubmitText: $('btn-submit-text'),

  modalOverlay: $('modal-overlay'),
  modalTitle: $('modal-title'),
  productForm: $('product-form'),
  productId: $('product-id'),

  fieldName: $('field-name'),
  fieldPrice: $('field-price'),
  fieldCategory: $('field-category'),
  fieldDescription: $('field-description'),
  fieldImage: $('field-image'),
  imagePreview: $('image-preview'),
  formErrors: $('form-errors'),

  searchInput: $('search-input'),
  productsTable: $('products-table'),
  productsBody: $('products-body'),
  loading: $('loading'),
  emptyState: $('empty-state'),
  count: $('count'),
  notifications: $('notifications'),

  deleteOverlay: $('delete-overlay'),
  btnCancelDelete: $('btn-cancel-delete'),
  btnConfirmDelete: $('btn-confirm-delete'),
};

function showLoginScreen() {
  els.loginScreen.classList.remove('hidden');
  els.mainApp.classList.add('hidden');
}

function showMainApp(user) {
  state.currentUser = user;
  els.loginScreen.classList.add('hidden');
  els.mainApp.classList.remove('hidden');
  els.userInfo.textContent = `${user.email} (${user.role})`;

  const canWrite = user.role === 'admin' || user.role === 'manager';
  els.btnOpenCreate.classList.toggle('hidden', !canWrite);
}

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
  state.currentUser = null;
  showLoginScreen();
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
    const imgCell = p.image_url
      ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" />`
      : `<span class="no-img">нет фото</span>`;
    const price = parseFloat(p.price).toLocaleString('ru-RU');
    const editBtn = canWrite ? `<button onclick="openEditModal(${p.id})">Изм.</button>` : '';
    const delBtn = canDelete ? `<button class="del-btn" onclick="openDeleteModal(${p.id})">Уд.</button>` : '';

    tr.innerHTML = `
      <td>${imgCell}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category || '—')}</td>
      <td>${price} ₽</td>
      <td>${escapeHtml(p.description || '—')}</td>
      <td><div class="actions">${editBtn}${delBtn}</div></td>
    `;
    els.productsBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadProducts() {
  els.loading.classList.remove('hidden');
  els.productsTable.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  try {
    const json = await api.getAll();
    if (!json.success) throw new Error(json.message || 'Ошибка загрузки');
    state.products = json.data;
    applyFilter();
  } catch (err) {
    showNotification('Не удалось загрузить продукты: ' + err.message, 'error');
  } finally {
    els.loading.classList.add('hidden');
  }
}

function applyFilter() {
  const query = els.searchInput.value.toLowerCase().trim();
  state.filtered = query
    ? state.products.filter(
        (p) => p.name.toLowerCase().includes(query) || (p.category && p.category.toLowerCase().includes(query))
      )
    : [...state.products];
  renderProducts(state.filtered);
}

function openCreateModal() {
  state.editingId = null;
  els.modalTitle.textContent = 'Новый продукт';
  els.btnSubmitText.textContent = 'Создать';
  els.productForm.reset();
  els.productId.value = '';
  els.imagePreview.classList.add('hidden');
  hideFormErrors();
  els.modalOverlay.classList.remove('hidden');
  els.fieldName.focus();
}

function openEditModal(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  state.editingId = id;
  els.modalTitle.textContent = 'Редактировать продукт';
  els.btnSubmitText.textContent = 'Сохранить';
  els.productForm.reset();
  els.productId.value = product.id;
  els.fieldName.value = product.name;
  els.fieldPrice.value = product.price;
  els.fieldCategory.value = product.category || '';
  els.fieldDescription.value = product.description || '';
  if (product.image_url) {
    els.imagePreview.src = product.image_url;
    els.imagePreview.classList.remove('hidden');
  } else {
    els.imagePreview.src = '';
    els.imagePreview.classList.add('hidden');
  }
  hideFormErrors();
  els.modalOverlay.classList.remove('hidden');
  els.fieldName.focus();
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  state.editingId = null;
}

function showFormErrors(errors) {
  els.formErrors.classList.remove('hidden');
  els.formErrors.innerHTML = `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
}

function hideFormErrors() {
  els.formErrors.classList.add('hidden');
  els.formErrors.innerHTML = '';
}

els.productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFormErrors();
  const formData = new FormData();
  formData.append('name', els.fieldName.value);
  formData.append('price', els.fieldPrice.value);
  formData.append('category', els.fieldCategory.value);
  formData.append('description', els.fieldDescription.value);
  const imageFile = els.fieldImage.files[0];
  if (imageFile) formData.append('image', imageFile);

  els.btnSubmit.disabled = true;
  els.btnSubmitText.textContent = state.editingId ? 'Сохранение...' : 'Создание...';

  try {
    let json;
    if (state.editingId) {
      json = await api.update(state.editingId, formData);
    } else {
      json = await api.create(formData);
    }
    if (!json.success) {
      const errors = json.errors || [json.message || 'Неизвестная ошибка'];
      showFormErrors(errors);
      return;
    }
    closeModal();
    showNotification(state.editingId ? 'Продукт обновлён' : 'Продукт создан', 'success');
    await loadProducts();
  } catch (err) {
    showNotification('Ошибка: ' + err.message, 'error');
  } finally {
    els.btnSubmit.disabled = false;
    els.btnSubmitText.textContent = state.editingId ? 'Сохранить' : 'Создать';
  }
});

function openDeleteModal(id) {
  state.deletingId = id;
  els.deleteOverlay.classList.remove('hidden');
}

function closeDeleteModal() {
  state.deletingId = null;
  els.deleteOverlay.classList.add('hidden');
}

els.btnConfirmDelete.addEventListener('click', async () => {
  if (!state.deletingId) return;
  els.btnConfirmDelete.disabled = true;
  els.btnConfirmDelete.textContent = 'Удаление...';
  try {
    const json = await api.delete(state.deletingId);
    if (!json.success) {
      showNotification(json.message || 'Ошибка удаления', 'error');
      return;
    }
    closeDeleteModal();
    showNotification('Продукт удалён', 'success');
    await loadProducts();
  } catch (err) {
    showNotification('Ошибка сети: ' + err.message, 'error');
  } finally {
    els.btnConfirmDelete.disabled = false;
    els.btnConfirmDelete.textContent = 'Удалить';
  }
});

els.fieldImage.addEventListener('change', () => {
  const file = els.fieldImage.files[0];
  if (!file) return;
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
els.modalOverlay.addEventListener('click', (e) => { if (e.target === els.modalOverlay) closeModal(); });
els.btnCancelDelete.addEventListener('click', closeDeleteModal);
els.deleteOverlay.addEventListener('click', (e) => { if (e.target === els.deleteOverlay) closeDeleteModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeDeleteModal(); } });
els.searchInput.addEventListener('input', applyFilter);

window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;

async function init() {
  const token = tokenStorage.getAccess();
  if (!token) {
    showLoginScreen();
    return;
  }
  try {
    const res = await authFetch(`${API_BASE}/auth/me`);
    const json = await res.json();
    if (json.success) {
      showMainApp(json.data);
      loadProducts();
    } else {
      showLoginScreen();
    }
  } catch {
    showLoginScreen();
  }
}

init();
