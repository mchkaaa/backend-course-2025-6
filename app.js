const { Command } = require('commander');
const http = require('http');
const fs = require('fs');
const path = require('path');

const program = new Command();

// Налаштовуємо команди
program
  .version('1.0.0')
  .description('Backend Course 2025-6 HTTP Server')
  .requiredOption('-h, --host <host>', 'адреса сервера (обовʼязковий)')
  .requiredOption('-p, --port <port>', 'порт сервера (обовʼязковий)')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії кешу (обовʼязковий)')
  .parse(process.argv);

const options = program.opts();

// Функція для створення директорії кешу
function createCacheDirectory(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
      console.log(` Створено директорію кешу: ${cachePath}`);
    } else {
      console.log(` Директорія кешу вже існує: ${cachePath}`);
    }
  } catch (error) {
    console.error(` Помилка при створенні директорії кешу: ${error.message}`);
    process.exit(1);
  }
}

// Створюємо HTTP сервер
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <head><title>Backend Course Server</title></head>
      <body>
        <h1> Сервер працює!</h1>
        <p>Host: ${options.host}</p>
        <p>Port: ${options.port}</p>
        <p>Cache directory: ${options.cache}</p>
        <p>Час: ${new Date().toLocaleString()}</p>
      </body>
    </html>
  `);
});

// Запускаємо сервер
try {
  // Створюємо директорію кешу
  createCacheDirectory(options.cache);
  
  // Запускаємо сервер
  server.listen(options.port, options.host, () => {
    console.log('══════════════════════════════════════');
    console.log(' HTTP Сервер запущено!');
    console.log(` Адреса: http://${options.host}:${options.port}`);
    console.log(` Кеш: ${options.cache}`);
    console.log(' Сервер запущено:', new Date().toLocaleString());
    console.log('══════════════════════════════════════');
  });
  
} catch (error) {
  console.error(' Помилка при запуску сервера:', error.message);
  process.exit(1);
}

// Обробка помилок сервера
server.on('error', (error) => {
  console.error(' Помилка сервера:', error.message);
});

// Обробка закриття процесу
process.on('SIGINT', () => {
  console.log('\n Зупинка сервера...');
  server.close(() => {
    console.log(' Сервер зупинено');
    process.exit(0);
  });
});