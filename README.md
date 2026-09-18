# ProductHub — Лабораторная работа

> **SPA + REST API + PostgreSQL + Docker**  
> Полный CRUD-каталог товаров с загрузкой изображений

---

## Содержание

1. [Что за проект](#что-за-проект)
2. [Как запустить](#как-запустить)
3. [Структура проекта](#структура-проекта)
4. [Архитектура](#архитектура)
5. [Сервер — подробное объяснение](#сервер)
6. [Клиент — подробное объяснение](#клиент)
7. [Docker — как это всё работает вместе](#docker)
8. [API Reference](#api-reference)
9. [Как выполняются требования лабораторной](#требования)

---

## Что за проект

Приложение **«Менеджер продуктов»** — это веб-каталог товаров.

**Что умеет:**
- Создавать продукты с названием, ценой, категорией, описанием и фото
- Редактировать и удалять продукты
- Искать продукты по названию и категории
- Загружать изображения (multipart/form-data)
- Работать без перезагрузки страницы (SPA)

**Технологии:**
| Слой | Технология | Для чего |
|------|-----------|---------|
| Клиент | HTML + CSS + Vanilla JS | SPA-интерфейс |
| Сервер | Node.js + Express.js | REST API |
| База данных | PostgreSQL | Хранение данных |
| Загрузка файлов | Multer | multipart/form-data |
| Инфраструктура | Docker + docker-compose | Контейнеризация |
| Прокси | Nginx | Раздача статики |

---

## Как запустить

**Требования:** установленный Docker Desktop

```bash
# 1. Перейдите в папку проекта
cd cpp_cource_project

# 2. Запустите все контейнеры
docker-compose up --build

# 3. Откройте в браузере
# http://localhost       — приложение
# http://localhost:3000  — API напрямую
```

**Остановить:**
```bash
docker-compose down
```

**Остановить и удалить все данные (включая БД):**
```bash
docker-compose down -v
```

---

## Структура проекта

```
cpp_cource_project/
│
├── docker-compose.yml          # Конфигурация всех контейнеров
│
├── server/                     # Node.js приложение
│   ├── Dockerfile              # Как собрать контейнер сервера
│   ├── package.json            # Зависимости npm
│   ├── .env                    # Переменные окружения (порт, данные БД)
│   └── src/
│       ├── index.js            # Точка входа, запуск сервера
│       ├── db.js               # Подключение к PostgreSQL
│       ├── uploads/            # Папка для хранения загруженных файлов
│       ├── middleware/
│       │   ├── upload.js       # Multer: обработка загрузки файлов
│       │   └── validate.js     # Валидация входных данных
│       └── routes/
│           └── products.js     # Все CRUD маршруты для /api/products
│
└── client/                     # Статический SPA
    ├── Dockerfile              # Как собрать контейнер клиента (nginx)
    ├── nginx.conf              # Конфиг nginx: статика + проксирование API
    ├── index.html              # Единственная HTML страница
    ├── style.css               # Все стили
    └── app.js                  # Вся логика SPA (fetch, DOM, события)
```

---

## Архитектура

```
Браузер (http://localhost)
     |
     v
+-------------+
|    Nginx    |  <- Контейнер "client" на порту 80
|  (клиент)   |
+------+------+
       |
       +-- GET / -> отдаёт index.html, style.css, app.js
       |
       +-- /api/* -> проксирует запросы на ->
                        |
                        v
               +-----------------+
               |   Node.js       |  <- Контейнер "server" на порту 3000
               |   Express API   |
               +--------+--------+
                        |
                        |  SQL запросы (pg/Pool)
                        v
               +-----------------+
               |   PostgreSQL    |  <- Контейнер "postgres" на порту 5432
               |   База данных   |
               +-----------------+
```

**Как происходит запрос:**
1. Пользователь нажимает «Добавить продукт» → Браузер вызывает JS-код
2. JS собирает данные формы и делает `fetch('/api/products', { method: 'POST' })`
3. Nginx (порт 80) видит `/api/` и проксирует на `http://server:3000`
4. Express принимает запрос → запускает middleware (upload → validate)
5. Роут сохраняет данные в PostgreSQL и возвращает JSON
6. JS получает ответ и обновляет DOM (без перезагрузки)

---

## Сервер

### `package.json` — зависимости

```json
{
  "express":  "веб-фреймворк, обрабатывает HTTP запросы",
  "pg":       "клиент PostgreSQL для Node.js",
  "multer":   "обработка загрузки файлов (multipart/form-data)",
  "cors":     "разрешает запросы с других доменов (Cross-Origin Resource Sharing)",
  "dotenv":   "читает переменные окружения из файла .env"
}
```

### `src/index.js` — точка входа

Это **главный файл** сервера. Он:

1. Создаёт Express-приложение (`const app = express()`)
2. Подключает **middleware** — функции, которые обрабатывают каждый запрос:
   - `cors()` — разрешает запросы с других портов/доменов
   - `express.json()` — парсит тело запроса как JSON
   - `express.static()` — отдаёт загруженные файлы как статику
3. Регистрирует маршруты: `app.use('/api/products', productsRouter)`
4. Подключается к БД и запускает сервер

> **Аналог в Go:** это как `main()` + `http.ListenAndServe()` + регистрация хендлеров

### `src/db.js` — база данных

Использует **Pool (пул соединений)**:
- Пул — набор готовых подключений к PostgreSQL
- Вместо открытия нового подключения на каждый запрос (медленно!) берём готовое из пула
- После запроса соединение возвращается обратно

```js
// Аналог в Go:
// db, _ := sql.Open("postgres", connStr)
// db.SetMaxOpenConns(25)
```

При старте сервера `initDB()` создаёт таблицу `products` (если её нет).

### `src/middleware/upload.js` — загрузка файлов

**Multer** обрабатывает `multipart/form-data` запросы:
- **diskStorage** — настройка: куда (`uploads/`) и как называть файл (уникальное имя = timestamp + random)
- **fileFilter** — проверяет MIME-тип: только `image/*`
- **limits** — максимум 5 MB

Когда multer обработал запрос, в `req.file` появляется объект с именем сохранённого файла.

### `src/middleware/validate.js` — валидация

**Middleware** — это функция с сигнатурой `(req, res, next)`:
- Если данные **валидны** → вызывает `next()` → запрос идёт дальше
- Если **ошибка** → сразу отвечает `res.status(400).json(...)` → цепочка обрывается

```
POST /api/products
   |
   v
upload.single('image')   <- middleware 1: сохраняет файл
   |
   v
validateCreateProduct    <- middleware 2: проверяет поля
   |
   v
async (req, res) => {}   <- handler: сохраняет в БД
```

### `src/routes/products.js` — CRUD маршруты

Здесь реализован весь REST API. Каждый endpoint — **async функция** с `try/catch`:

| Метод | URL | Действие | Код успеха |
|-------|-----|----------|-----------|
| GET | `/api/products` | Список всех | 200 |
| GET | `/api/products/:id` | Один по ID | 200 / 404 |
| POST | `/api/products` | Создать | 201 |
| PUT | `/api/products/:id` | Обновить | 200 / 404 |
| DELETE | `/api/products/:id` | Удалить | 200 / 404 |

**Параметризованные запросы** защищают от SQL-инъекций:
```js
// Опасно:  `SELECT * WHERE id = ${id}`
// Правильно:
pool.query('SELECT * FROM products WHERE id = $1', [id])
//                                              ^ PostgreSQL подставляет безопасно
```

---

## Клиент

### `index.html` — единственная страница SPA

Страница содержит **всю разметку**, которая изначально «скрыта» или «пуста»:
- Header с кнопкой «Добавить»
- Модальное окно (форма создания/редактирования) — по умолчанию `hidden`
- Грид продуктов — заполняется JavaScript'ом
- Модальное окно подтверждения удаления

Атрибут `enctype="multipart/form-data"` на форме говорит браузеру — «в этой форме могут быть файлы».

### `style.css` — стили

Используется **CSS Custom Properties** (переменные) для единой дизайн-системы:
```css
:root {
  --accent: #6c63ff;   /* основной цвет */
  --bg-card: #1a1a24;  /* фон карточек */
  /* ... */
}
```

Анимации реализованы через `@keyframes` и `transition`.

### `app.js` — логика SPA

**Основные части:**

#### 1. API модуль
```js
const api = {
  getAll()       // => fetch('GET /api/products')
  create(data)   // => fetch('POST /api/products', formData)
  update(id, d)  // => fetch('PUT /api/products/:id', formData)
  delete(id)     // => fetch('DELETE /api/products/:id')
}
```

Каждый метод возвращает **Promise** — асинхронный результат. Мы используем `async/await` чтобы писать асинхронный код как синхронный.

> **Аналог в Go:** как `http.Get()` + `io.ReadAll(resp.Body)` + `json.Unmarshal()`

#### 2. State (состояние)
```js
const state = {
  products: [],    // все продукты из БД
  filtered: [],    // после поиска
  editingId: null, // null = создание, число = редактирование
  deletingId: null
}
```

#### 3. Рендеринг
`renderProducts(products)` — строит HTML для каждой карточки через шаблонные строки и вставляет в DOM через `innerHTML`.

#### 4. Почему нет перезагрузки страницы?
- Форма имеет `e.preventDefault()` — отменяем стандартную отправку формы
- Данные отправляем через `fetch()` — AJAX запрос в фоне
- Получив ответ — обновляем DOM: добавляем/убираем карточки

```js
form.addEventListener('submit', async (e) => {
  e.preventDefault()   // <- Это ключевой момент!
  const json = await api.create(formData)
  renderProducts(...)  // Обновляем страницу без перезагрузки
})
```

#### 5. FormData для файлов
```js
const formData = new FormData()
formData.append('name', 'Телефон')
formData.append('image', fileInput.files[0])  // <- файл!

fetch('/api/products', {
  method: 'POST',
  body: formData   // браузер сам ставит Content-Type: multipart/form-data
})
```

---

## Docker

### Зачем 3 контейнера?

Принцип: **один контейнер = одна ответственность**

| Контейнер | Образ | Роль |
|-----------|-------|------|
| `postgres` | `postgres:16-alpine` | База данных |
| `server` | `node:20-alpine` (наш) | REST API |
| `client` | `nginx:alpine` (наш) | Статика + прокси |

### Как контейнеры общаются?

В `docker-compose` все сервисы находятся в одной **внутренней сети**.  
Имя сервиса = хост. Поэтому в настройках сервера пишем `DB_HOST: postgres` — это не IP, это имя контейнера.

### Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U admin -d products_db"]
```

PostgreSQL запускается не мгновенно. `healthcheck` периодически проверяет готовность.  
Сервер `depends_on: postgres: condition: service_healthy` — ждёт пока postgres пройдёт проверку.

### Volumes

```yaml
volumes:
  postgres_data:   # данные БД сохраняются при перезапуске контейнера
  uploads_data:    # загруженные файлы тоже
```

Без volume данные удаляются вместе с контейнером.

### Nginx как прокси

```nginx
location /api/ {
    proxy_pass http://server:3000;  # перенаправляем на Node.js
}
location / {
    try_files $uri /index.html;     # для SPA: всё -> index.html
}
```

---

## API Reference

### Создать продукт

```
POST /api/products
Content-Type: multipart/form-data

name        (string, обязательно)   — название
price       (number, обязательно)   — цена >= 0
category    (string, опционально)   — категория, макс 100 символов
description (string, опционально)   — описание
image       (file, опционально)     — JPEG/PNG/GIF/WEBP, макс 5MB
```

**Успех (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "iPhone 15",
    "price": "79990.00",
    "category": "Электроника",
    "description": "...",
    "image_url": "/uploads/1234567890.jpg",
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

**Ошибка валидации (400):**
```json
{
  "success": false,
  "message": "Ошибка валидации",
  "errors": ["Поле \"name\" обязательно", "Поле \"price\" должно быть числом"]
}
```

### Получить все продукты

```
GET /api/products
=> 200: { "success": true, "data": [...] }
```

### Получить продукт

```
GET /api/products/:id
=> 200: { "success": true, "data": {...} }
=> 404: { "success": false, "message": "Продукт не найден" }
```

### Обновить продукт

```
PUT /api/products/:id
Content-Type: multipart/form-data
(те же поля, все опциональны)

=> 200: { "success": true, "data": {...} }
=> 404: { "success": false, "message": "Продукт не найден" }
```

### Удалить продукт

```
DELETE /api/products/:id
=> 200: { "success": true, "message": "Продукт успешно удалён" }
=> 404: { "success": false, "message": "Продукт не найден" }
```

---

## Требования

Ниже — как проект выполняет каждое требование лабораторной:

| Требование | Реализация |
|-----------|-----------|
| ✅ SPA на клиенте | `index.html` — одна страница, DOM обновляется через JS |
| ✅ REST API на сервере | Express router, правильные HTTP-методы |
| ✅ Полный CRUD | GET/POST/PUT/DELETE в `routes/products.js` |
| ✅ JSON обмен данными | `res.json()` на сервере, `fetch().then(r => r.json())` на клиенте |
| ✅ multipart/form-data | Multer middleware, FormData на клиенте |
| ✅ Без перезагрузки | `e.preventDefault()` + `fetch()` + DOM-рендеринг |
| ✅ Правильные HTTP методы | GET читает, POST создаёт, PUT обновляет, DELETE удаляет |
| ✅ Правильные коды ответов | 200, 201, 400, 404, 500 |
| ✅ Валидация на сервере | `middleware/validate.js` |
| ✅ Сообщения об ошибках | `showNotification()` + `showFormErrors()` |
| ✅ Node.js с PostgreSQL | Express + pg Pool |
| ✅ Docker контейнеры | `docker-compose.yml` с 3 сервисами |
