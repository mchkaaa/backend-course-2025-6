const { Command } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

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
      console.log(` Створено директорію кешу: ${cachePath}`);
    } else {
      console.log(` Директорія кешу вже існує: ${cachePath}`);
    }
    
    // Створюємо піддиректорію для фото
    const photosDir = path.join(cachePath, 'photos');
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
      console.log(` Створено директорію для фото: ${photosDir}`);
    }
  } catch (error) {
    console.error(` Помилка при створенні директорії кешу: ${error.message}`);
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
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  console.log(` ${method} ${pathname}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Обробка маршрутів
  try {
    // Маршрут 8: HTML форма для реєстрації
    if (pathname === '/RegisterForm.html' && method === 'GET') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Реєстрація пристрою</title>
            <meta charset="utf-8">
        </head>
        <body>
            <h1> Реєстрація нового пристрою</h1>
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

    // Маршрут 9: HTML форма для пошуку
    if (pathname === '/SearchForm.html' && method === 'GET') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Пошук пристрою</title>
            <meta charset="utf-8">
        </head>
        <body>
            <h1> Пошук пристрою</h1>
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

    // Для інших маршрутів повертаємо 405 якщо метод не підтримується
    const supportedMethods = {
      '/register': ['POST'],
      '/inventory': ['GET'],
      '/search': ['POST']
    };

    if (supportedMethods[pathname] && !supportedMethods[pathname].includes(method)) {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // Обробка тіла запиту
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // Тут буде обробка інших маршрутів
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Backend Course Server</title></head>
          <body>
            <h1> Сервер працює!</h1>
            <p>Базова структура готова. Додаємо ендпоінти...</p>
            <p><a href="/RegisterForm.html">Форма реєстрації</a></p>
            <p><a href="/SearchForm.html">Форма пошуку</a></p>
          </body>
        </html>
      `);
    });

  } catch (error) {
    console.error(' Помилка:', error);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// Запускаємо сервер
try {
  createCacheDirectory(options.cache);
  
  server.listen(options.port, options.host, () => {
    console.log('══════════════════════════════════════');
    console.log(' Inventory Server запущено!');
    console.log(` Адреса: http://${options.host}:${options.port}`);
    console.log(` Кеш: ${options.cache}`);
    console.log(' Сервер запущено:', new Date().toLocaleString());
    console.log('══════════════════════════════════════');
  });
  
} catch (error) {
  console.error(' Помилка при запуску сервера:', error.message);
  process.exit(1);
}

server.on('error', (error) => {
  console.error(' Помилка сервера:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n Зупинка сервера...');
  server.close(() => {
    console.log(' Сервер зупинено');
    process.exit(0);
  });
});