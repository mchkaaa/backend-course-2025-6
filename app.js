// ========================
//   Imports
// ========================
const express = require("express");
const fs = require("fs");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const multer = require("multer");
const cors = require("cors"); // Додано CORS
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

// ========================
//   CLI Arguments (YARGS)
// ========================
const argv = yargs(hideBin(process.argv))
  .option("h", {
    alias: "host",
    type: "string",
    demandOption: true,
    describe: "Server host",
  })
  .option("p", {
    alias: "port",
    type: "number",
    demandOption: true,
    describe: "Server port",
  })
  .option("c", {
    alias: "cache",
    type: "string",
    demandOption: true,
    describe: "Cache directory",
  })
  .help()
  .argv;

const HOST = argv.h;
const PORT = argv.p;
const CACHE_DIR = path.resolve(argv.c);

// ========================
//   In-memory Data Store
// ========================
let inventory = [];
let nextId = 1;

// ========================
//   Ensure cache exists
// ========================
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const photosDir = path.join(CACHE_DIR, 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

// ========================
//   Create Express app
// ========================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================
//   Multer Configuration
// ========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) => cb(null, `temp-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// ========================
//   SWAGGER CONFIG
// ========================
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory Service API",
      version: "1.0.0",
      description: "Service for inventory management",
    },
    servers: [{ url: `http://${HOST}:${PORT}` }],
  },
  apis: [__filename],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ========================
//   Helper
// ========================
const methodNotAllowed = (req, res) => res.status(405).send('Method Not Allowed');

// ========================
//   HTML Form Routes
// ========================

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Веб форма для реєстрації пристрою
 *     responses:
 *       200:
 *         description: HTML форма успішно віддана
 *       404:
 *         description: Файл не знайдено
 */
app.route('/RegisterForm.html')
  .get((req, res) => {
    const filePath = path.join(__dirname, 'RegisterForm.html');
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('RegisterForm.html not found');
  })
  .all(methodNotAllowed);


/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Веб форма для пошуку пристрою
 *     responses:
 *       200:
 *         description: HTML форма успішно віддана
 *       404:
 *         description: Файл не знайдено
 */
app.route('/SearchForm.html')
  .get((req, res) => {
    const filePath = path.join(__dirname, 'SearchForm.html');
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('SearchForm.html not found');
  })
  .all(methodNotAllowed);

// ========================
//   INVENTORY ROUTES
// ========================

// ------------------------
// /register
// ------------------------
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request (Missing inventory_name)
 */
app.route('/register')
  .post(upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) return res.status(400).send('Inventory name is required');

    const newItem = {
      id: nextId++,
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      photo_filename: null
    };

    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const newFilename = `photo_${newItem.id}${ext}`;
      const oldPath = req.file.path;
      const newPath = path.join(photosDir, newFilename);
      try { fs.renameSync(oldPath, newPath); newItem.photo_filename = newFilename; } 
      catch (e) { console.error(e); }
    }

    inventory.push(newItem);
    res.status(201).json({ message: 'Device registered', id: newItem.id });
  })
  .all(methodNotAllowed);

// ------------------------
// /inventory
// ------------------------
/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримання списку всіх речей
 *     responses:
 *       200:
 *         description: OK
 */
app.route('/inventory')
  .get((req, res) => {
    const result = inventory.map(item => ({
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
      photo_url: item.photo_filename ? `/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(result);
  })
  .all(methodNotAllowed);

// ------------------------
// /inventory/:id
// ------------------------
/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримання інформації про річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not Found }
 *   put:
 *     summary: Оновлення імені або опису
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not Found }
 *   delete:
 *     summary: Видалення речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not Found }
 */
app.route('/inventory/:id')
  .get((req, res) => {
    const item = inventory.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).send('Not found');
    res.json({ ...item, photo_url: item.photo_filename ? `/inventory/${item.id}/photo` : null });
  })
  .put((req, res) => {
    const item = inventory.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).send('Not found');
    if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
    if (req.body.description !== undefined) item.description = req.body.description;
    res.json({ message: 'Updated', item });
  })
  .delete((req, res) => {
    const id = parseInt(req.params.id);
    const index = inventory.findIndex(i => i.id === id);
    if (index === -1) return res.status(404).send('Not found');
    const item = inventory[index];
    if (item.photo_filename) try { fs.unlinkSync(path.join(photosDir, item.photo_filename)); } catch(e) {}
    inventory.splice(index, 1);
    res.json({ message: 'Deleted' });
  })
  .all(methodNotAllowed);

// ------------------------
// /inventory/:id/photo
// ------------------------
/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Image found
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404: { description: Not Found }
 *   put:
 *     summary: Оновлення фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Photo updated }
 *       404: { description: Not Found }
 */
app.route('/inventory/:id/photo')
  .get((req, res) => {
    const item = inventory.find(i => i.id === parseInt(req.params.id));
    if (!item || !item.photo_filename) return res.status(404).send('Not found');
    const filePath = path.join(photosDir, item.photo_filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.sendFile(filePath);
  })
  .put(upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).send('Not found');
    if (!req.file) return res.status(400).send('No file uploaded');
    if (item.photo_filename) try { fs.unlinkSync(path.join(photosDir, item.photo_filename)); } catch(e) {}
    const newFilename = `photo_${item.id}${path.extname(req.file.originalname)}`;
    try { fs.renameSync(req.file.path, path.join(photosDir, newFilename)); item.photo_filename = newFilename; res.json({ message: 'Photo updated' }); } 
    catch(e) { res.status(500).send('Error saving file'); }
  })
  .all(methodNotAllowed);

// ------------------------
// /search
// ------------------------
/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук пристрою
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Серійний номер / ID пристрою
 *               has_photo:
 *                 type: boolean
 *                 description: Checkbox для додавання посилання на фото в опис
 *     responses:
 *       200: { description: Found }
 *       404: { description: Not Found }
 */
app.route('/search')
  .post((req, res) => {
    const id = parseInt(req.body.id);
    const hasPhoto = req.body.has_photo === 'true' || req.body.has_photo === 'on';
    const item = inventory.find(i => i.id === id);
    if (!item) return res.status(404).send('Not found');
    const responseItem = { ...item };
    if (hasPhoto && item.photo_filename) responseItem.description += ` (Photo link: /inventory/${item.id}/photo)`;
    res.json(responseItem);
  })
  .all(methodNotAllowed);

// ========================
//   START SERVER
// ========================
app.listen(PORT, HOST, () => {
  console.log(`Сервер запущено на http://${HOST}:${PORT}`);
  console.log(`Документація: http://${HOST}:${PORT}/api-docs`);
});
