const { Command } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const swaggerJSDoc = require('swagger-jsdoc');

// Swagger configuration
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Inventory Management API',
    version: '1.0.0',
    description: 'API для управління інвентарем пристроїв',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
};

const swaggerOptions = {
  swaggerDefinition,
  apis: ['./app.js'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

const program = new Command();

program
  .version('1.0.0')
  .description('Backend Course 2025-6 Inventory Server')
  .option('-h, --host <host>', 'адреса сервера', 'localhost')
  .option('-p, --port <port>', 'порт сервера', '3000')
  .option('-c, --cache <cache>', 'шлях до директорії кешу', './cache')
  .parse(process.argv);

const options = program.opts();

// Структура для зберігання інвентарю
let inventory = [];
let nextId = 1;

// Функція для створення директорії кешу
function createCacheDirectory(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
      console.log(`Створено директорію кешу: ${cachePath}`);
    } else {
      console.log(`Директорія кешу вже існує: ${cachePath}`);
    }
    
    // Створюємо піддиректорію для фото
    const photosDir = path.join(cachePath, 'photos');
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
      console.log(`Створено директорію для фото: ${photosDir}`);
    }
  } catch (error) {
    console.error(`Помилка при створенні директорії кешу: ${error.message}`);
    process.exit(1);
  }
}

// Функція для парсингу multipart/form-data
function parseMultipartFormData(body, contentType) {
  const boundary = contentType.split('boundary=')[1];
  const parts = body.split(`--${boundary}`);
  const result = {};
  
  for (const part of parts) {
    if (part.includes('Content-Disposition')) {
      const nameMatch = part.match(/name="([^"]+)"/);
      const filenameMatch = part.match(/filename="([^"]+)"/);
      
      if (nameMatch) {
        const name = nameMatch[1];
        const value = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
        
        if (filenameMatch) {
          // Це файл
          result[name] = {
            filename: filenameMatch[1],
            data: Buffer.from(part.split('\r\n\r\n')[1] || '')
          };
        } else {
          // Це текстове поле
          result[name] = value;
        }
      }
    }
  }
  
  return result;
}

// Функція для відправки JSON відповіді
function sendJSONResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Функція для відправки HTML відповіді
function sendHTMLResponse(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Функція для відправки фото
function sendPhotoResponse(res, photoPath) {
  try {
    if (fs.existsSync(photoPath)) {
      const photo = fs.readFileSync(photoPath);
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(photo);
    } else {
      res.writeHead(404);
      res.end('Photo not found');
    }
  } catch (error) {
    res.writeHead(500);
    res.end('Error reading photo');
  }
}

// Створюємо HTTP сервер
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  console.log(`${method} ${pathname}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  /**
   * @swagger
   * /docs:
   *   get:
   *     summary: Swagger UI документація
   *     description: HTML сторінка з інтерактивною документацією API
   *     responses:
   *       200:
   *         description: HTML сторінка Swagger UI
   */
  if (pathname === '/docs' && method === 'GET') {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Inventory API Documentation</title>
          <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
      </head>
      <body>
          <div id="swagger-ui"></div>
          <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
          <script>
              SwaggerUIBundle({
                  url: '/swagger.json',
                  dom_id: '#swagger-ui',
              });
          </script>
      </body>
      </html>
    `;
    sendHTMLResponse(res, 200, html);
    return;
  }

  /**
   * @swagger
   * /swagger.json:
   *   get:
   *     summary: Swagger специфікація
   *     description: JSON файл з описом API для Swagger
   *     responses:
   *       200:
   *         description: Swagger специфікація у форматі JSON
   */
  if (pathname === '/swagger.json' && method === 'GET') {
    sendJSONResponse(res, 200, swaggerSpec);
    return;
  }

  // Обробка маршрутів
  try {
    /**
     * @swagger
     * /RegisterForm.html:
     *   get:
     *     summary: HTML форма для реєстрації пристрою
     *     description: Повертає HTML сторінку з формою для реєстрації нового пристрою
     *     responses:
     *       200:
     *         description: HTML форма реєстрації
     */
    if (pathname === '/RegisterForm.html' && method === 'GET') {
      const html = `
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <title>Реєстрація пристрою</title>
            <meta charset="utf-8">
        </head>
        <body>
            <h1>Реєстрація нового пристрою</h1>
            <form action="/register" method="post" enctype="multipart/form-data">
                <div>
                    <label>Назва пристрою*:</label><br>
                    <input type="text" name="inventory_name" required>
                </div>
                <div>
                    <label>Опис:</label><br>
                    <textarea name="description" rows="4" cols="50"></textarea>
                </div>
                <div>
                    <label>Фото:</label><br>
                    <input type="file" name="photo" accept="image/*">
                </div>
                <br>
                <button type="submit">Зареєструвати</button>
            </form>
        </body>
        </html>
      `;
      sendHTMLResponse(res, 200, html);
      return;
    }

    /**
     * @swagger
     * /SearchForm.html:
     *   get:
     *     summary: HTML форма для пошуку пристрою
     *     description: Повертає HTML сторінку з формою для пошуку пристрою за ID
     *     responses:
     *       200:
     *         description: HTML форма пошуку
     */
    if (pathname === '/SearchForm.html' && method === 'GET') {
      const html = `
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <title>Пошук пристрою</title>
            <meta charset="utf-8">
        </head>
        <body>
            <h1>Пошук пристрою</h1>
            <form action="/search" method="post">
                <div>
                    <label>ID пристрою:</label><br>
                    <input type="text" name="id" required>
                </div>
                <div>
                    <label>
                        <input type="checkbox" name="has_photo" value="true">
                        Додати посилання на фото
                    </label>
                </div>
                <br>
                <button type="submit">Пошук</button>
            </form>
        </body>
        </html>
      `;
      sendHTMLResponse(res, 200, html);
      return;
    }

    // Обробка тіла запиту
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        /**
         * @swagger
         * /register:
         *   post:
         *     summary: Реєстрація нового пристрою
         *     description: Створює новий запис пристрою з фото та описом
         *     requestBody:
         *       required: true
         *       content:
         *         multipart/form-data:
         *           schema:
         *             type: object
         *             properties:
         *               inventory_name:
         *                 type: string
         *                 description: Назва пристрою
         *               description:
         *                 type: string
         *                 description: Опис пристрою
         *               photo:
         *                 type: string
         *                 format: binary
         *                 description: Фото пристрою
         *     responses:
         *       201:
         *         description: Пристрій успішно зареєстровано
         *       400:
         *         description: Відсутня назва пристрою або неправильний Content-Type
         */
        if (pathname === '/register' && method === 'POST') {
          const contentType = req.headers['content-type'];
          
          if (!contentType || !contentType.includes('multipart/form-data')) {
            res.writeHead(400);
            res.end('Content-Type must be multipart/form-data');
            return;
          }

          const formData = parseMultipartFormData(body, contentType);
          
          // Перевірка обов'язкового поля
          if (!formData.inventory_name) {
            res.writeHead(400);
            res.end('Inventory name is required');
            return;
          }

          // Створюємо новий запис
          const newItem = {
            id: nextId++,
            inventory_name: formData.inventory_name,
            description: formData.description || '',
            photo_filename: null,
            created_at: new Date().toISOString()
          };

          // Зберігаємо фото якщо є
          if (formData.photo && formData.photo.filename) {
            const photoExt = path.extname(formData.photo.filename) || '.jpg';
            newItem.photo_filename = `photo_${newItem.id}${photoExt}`;
            const photoPath = path.join(options.cache, 'photos', newItem.photo_filename);
            
            fs.writeFileSync(photoPath, formData.photo.data);
            console.log(`Фото збережено: ${newItem.photo_filename}`);
          }

          // Додаємо в інвентар
          inventory.push(newItem);
          
          console.log(`Зареєстровано новий пристрій: ${newItem.inventory_name} (ID: ${newItem.id})`);
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'Device registered successfully',
            id: newItem.id
          }));
          return;
        }

        /**
         * @swagger
         * /inventory:
         *   get:
         *     summary: Отримання списку всіх пристроїв
         *     description: Повертає JSON зі списком всіх інвентаризованих пристроїв
         *     responses:
         *       200:
         *         description: Успішно отримано список пристроїв
         */
        if (pathname === '/inventory' && method === 'GET') {
          const inventoryWithPhotos = inventory.map(item => ({
            ...item,
            photo_url: item.photo_filename ? `/inventory/${item.id}/photo` : null
          }));
          
          sendJSONResponse(res, 200, inventoryWithPhotos);
          return;
        }

        /**
         * @swagger
         * /inventory/{id}:
         *   get:
         *     summary: Отримання інформації про конкретний пристрій
         *     description: Повертає інформацію про пристрій за вказаним ID
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: integer
         *         description: ID пристрою
         *     responses:
         *       200:
         *         description: Інформація про пристрій
         *       404:
         *         description: Пристрій не знайдено
         */
        if (pathname.startsWith('/inventory/') && !pathname.includes('/photo') && method === 'GET') {
          const id = parseInt(pathname.split('/')[2]);
          const item = inventory.find(i => i.id === id);
          
          if (!item) {
            res.writeHead(404);
            res.end('Item not found');
            return;
          }
          
          const itemWithPhoto = {
            ...item,
            photo_url: item.photo_filename ? `/inventory/${item.id}/photo` : null
          };
          
          sendJSONResponse(res, 200, itemWithPhoto);
          return;
        }

        /**
         * @swagger
         * /inventory/{id}:
         *   put:
         *     summary: Оновлення інформації про пристрій
         *     description: Оновлює назву та/або опис пристрою
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: integer
         *         description: ID пристрою
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               inventory_name:
         *                 type: string
         *                 description: Нова назва пристрою
         *               description:
         *                 type: string
         *                 description: Новий опис пристрою
         *     responses:
         *       200:
         *         description: Інформація успішно оновлена
         *       404:
         *         description: Пристрій не знайдено
         *       400:
         *         description: Неправильний JSON формат
         */
        if (pathname.startsWith('/inventory/') && !pathname.includes('/photo') && method === 'PUT') {
          const id = parseInt(pathname.split('/')[2]);
          const itemIndex = inventory.findIndex(i => i.id === id);
          
          if (itemIndex === -1) {
            res.writeHead(404);
            res.end('Item not found');
            return;
          }
          
          try {
            const updates = JSON.parse(body);
            if (updates.inventory_name) {
              inventory[itemIndex].inventory_name = updates.inventory_name;
            }
            if (updates.description !== undefined) {
              inventory[itemIndex].description = updates.description;
            }
            
            console.log(`Оновлено пристрій ID: ${id}`);
            sendJSONResponse(res, 200, { message: 'Item updated successfully', item: inventory[itemIndex] });
          } catch (error) {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
          return;
        }

        /**
         * @swagger
         * /inventory/{id}/photo:
         *   get:
         *     summary: Отримання фото пристрою
         *     description: Повертає фото зображення пристрою у форматі JPEG
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: integer
         *         description: ID пристрою
         *     responses:
         *       200:
         *         description: Фото пристрою
         *         content:
         *           image/jpeg:
         *             schema:
         *               type: string
         *               format: binary
         *       404:
         *         description: Фото або пристрій не знайдено
         */
        if (pathname.startsWith('/inventory/') && pathname.endsWith('/photo') && method === 'GET') {
          const id = parseInt(pathname.split('/')[2]);
          const item = inventory.find(i => i.id === id);
          
          if (!item || !item.photo_filename) {
            res.writeHead(404);
            res.end('Photo not found');
            return;
          }
          
          const photoPath = path.join(options.cache, 'photos', item.photo_filename);
          sendPhotoResponse(res, photoPath);
          return;
        }

        /**
         * @swagger
         * /inventory/{id}/photo:
         *   put:
         *     summary: Оновлення фото пристрою
         *     description: Замінює фото пристрою на нове
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: integer
         *         description: ID пристрою
         *     requestBody:
         *       required: true
         *       content:
         *         multipart/form-data:
         *           schema:
         *             type: object
         *             properties:
         *               photo:
         *                 type: string
         *                 format: binary
         *                 description: Нове фото пристрою
         *     responses:
         *       200:
         *         description: Фото успішно оновлено
         *       404:
         *         description: Пристрій не знайдено
         *       400:
         *         description: Фото не надано або неправильний Content-Type
         */
        if (pathname.startsWith('/inventory/') && pathname.endsWith('/photo') && method === 'PUT') {
          const id = parseInt(pathname.split('/')[2]);
          const itemIndex = inventory.findIndex(i => i.id === id);
          
          if (itemIndex === -1) {
            res.writeHead(404);
            res.end('Item not found');
            return;
          }
          
          const contentType = req.headers['content-type'];
          if (!contentType || !contentType.includes('multipart/form-data')) {
            res.writeHead(400);
            res.end('Content-Type must be multipart/form-data');
            return;
          }
          
          const formData = parseMultipartFormData(body, contentType);
          
          if (!formData.photo || !formData.photo.filename) {
            res.writeHead(400);
            res.end('Photo is required');
            return;
          }
          
          // Видаляємо старе фото якщо є
          const oldPhotoFilename = inventory[itemIndex].photo_filename;
          if (oldPhotoFilename) {
            const oldPhotoPath = path.join(options.cache, 'photos', oldPhotoFilename);
            try {
              if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
              }
            } catch (error) {
              console.log('Не вдалося видалити старе фото:', error.message);
            }
          }
          
          // Зберігаємо нове фото
          const photoExt = path.extname(formData.photo.filename) || '.jpg';
          const newPhotoFilename = `photo_${id}${photoExt}`;
          const newPhotoPath = path.join(options.cache, 'photos', newPhotoFilename);
          
          fs.writeFileSync(newPhotoPath, formData.photo.data);
          inventory[itemIndex].photo_filename = newPhotoFilename;
          
          console.log(`Оновлено фото для пристрою ID: ${id}`);
          sendJSONResponse(res, 200, { message: 'Photo updated successfully' });
          return;
        }

        /**
         * @swagger
         * /inventory/{id}:
         *   delete:
         *     summary: Видалення пристрою
         *     description: Видаляє пристрій та його фото з інвентарю
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: integer
         *         description: ID пристрою
         *     responses:
         *       200:
         *         description: Пристрій успішно видалено
         *       404:
         *         description: Пристрій не знайдено
         */
        if (pathname.startsWith('/inventory/') && !pathname.includes('/photo') && method === 'DELETE') {
          const id = parseInt(pathname.split('/')[2]);
          const itemIndex = inventory.findIndex(i => i.id === id);
          
          if (itemIndex === -1) {
            res.writeHead(404);
            res.end('Item not found');
            return;
          }
          
          // Видаляємо фото якщо є
          const item = inventory[itemIndex];
          if (item.photo_filename) {
            const photoPath = path.join(options.cache, 'photos', item.photo_filename);
            try {
              if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
              }
            } catch (error) {
              console.log('Не вдалося видалити фото:', error.message);
            }
          }
          
          inventory.splice(itemIndex, 1);
          console.log(`Видалено пристрій ID: ${id}`);
          
          sendJSONResponse(res, 200, { message: 'Item deleted successfully' });
          return;
        }

        /**
         * @swagger
         * /search:
         *   post:
         *     summary: Пошук пристрою за ID
         *     description: Шукає пристрій за ID та повертає інформацію про нього
         *     requestBody:
         *       required: true
         *       content:
         *         application/x-www-form-urlencoded:
         *           schema:
         *             type: object
         *             properties:
         *               id:
         *                 type: integer
         *                 description: ID пристрою для пошуку
         *               has_photo:
         *                 type: boolean
         *                 description: Чи додавати посилання на фото
         *     responses:
         *       200:
         *         description: Інформація про знайдений пристрій
         *       404:
         *         description: Пристрій не знайдено
         */
        if (pathname === '/search' && method === 'POST') {
          const searchData = querystring.parse(body);
          const id = parseInt(searchData.id);
          const hasPhoto = searchData.has_photo === 'true';
          
          const item = inventory.find(i => i.id === id);
          
          if (!item) {
            res.writeHead(404);
            res.end('Item not found');
            return;
          }
          
          let responseItem = { ...item };
          if (hasPhoto && item.photo_filename) {
            responseItem.photo_url = `/inventory/${item.id}/photo`;
          }
          
          sendJSONResponse(res, 200, responseItem);
          return;
        }

        // Якщо маршрут не знайдено
        res.writeHead(404);
        res.end('Not Found');
        
      } catch (error) {
        console.error('Помилка:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

  } catch (error) {
    console.error('Помилка:', error);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// Запускаємо сервер
try {
  createCacheDirectory(options.cache);
  
  server.listen(options.port, options.host, () => {
    console.log('==========================================');
    console.log('Inventory Server запущено!');
    console.log(`Адреса: http://${options.host}:${options.port}`);
    console.log(`Кеш: ${options.cache}`);
    console.log('Сервер запущено:', new Date().toLocaleString());
    console.log('==========================================');
  });
  
} catch (error) {
  console.error('Помилка при запуску сервера:', error.message);
  process.exit(1);
}

server.on('error', (error) => {
  console.error('Помилка сервера:', error.message);
});

process.on('SIGINT', () => {
  console.log('\nЗупинка сервера...');
  server.close(() => {
    console.log('Сервер зупинено');
    process.exit(0);
  });
});