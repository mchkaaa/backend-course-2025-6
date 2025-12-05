// ========================
//   Imports
// ========================
const express = require("express");
const fs = require("fs");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const multer = require("multer");
const cors = require("cors");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

// ========================
//   CLI Arguments (YARGS)
// ========================
const argv = yargs(hideBin(process.argv))
  .option("h", {
    alias: "host",
    type: "string",
    default: "localhost",
    describe: "Server host",
  })
  .option("p", {
    alias: "port",
    type: "number",
    default: 3000,
    describe: "Server port",
  })
  .option("c", {
    alias: "cache",
    type: "string",
    default: "./cache",
    describe: "Cache directory",
  })
  .help()
  .argv;

const HOST = argv.h;
const PORT = argv.p;
const CACHE_DIR = path.resolve(argv.c);

// ========================
//   In-memory Data Store
// ========================
let inventory = [];
let nextId = 1; //Лічильник для унікальних номерів пристроїв.

// ========================
//   Ensure directories & files exist
// ========================
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const photosDir = path.join(CACHE_DIR, "photos");
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

// HTML Templates
const registerHtmlContent = `
<!DOCTYPE html>
<html>
<body>
    <h2>Register Device</h2>
    <form action="/register" method="POST" enctype="multipart/form-data">
        Name: <input type="text" name="inventory_name" required><br><br>
        Description: <input type="text" name="description"><br><br>
        Photo: <input type="file" name="photo"><br><br>
        <button type="submit">Register</button>
    </form>
</body>
</html>`;

const searchHtmlContent = `
<!DOCTYPE html>
<html>
<body>
    <h2>Search Device</h2>
    <form action="/search" method="POST" enctype="application/x-www-form-urlencoded">
        ID: <input type="number" name="id" required><br><br>
        Add Photo Link to Description: <input type="checkbox" name="has_photo"><br><br>
        <button type="submit">Search</button>
    </form>
</body>
</html>`;

const registerPath = path.join(__dirname, "RegisterForm.html");
const searchPath = path.join(__dirname, "SearchForm.html");

//якщо не існує створить html
if (!fs.existsSync(registerPath)) fs.writeFileSync(registerPath, registerHtmlContent); 
if (!fs.existsSync(searchPath)) fs.writeFileSync(searchPath, searchHtmlContent);

// ========================
//   Create Express app
// ========================
const app = express();
app.use(cors()); //блокує запити між різними сайтами
app.use(express.json()); //middleware json
app.use(express.urlencoded({ extended: true }));  //middleware urlencoded

// ========================
//   Multer Configuration
// ========================
const storage = multer.diskStorage({  //multer перетворює файл з "потоку даних" на звичайний файл на диску
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) =>
    cb(null, `temp-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

// ========================
//   SWAGGER CONFIG
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
//   Helper Middleware
// ========================
const methodNotAllowed = (req, res) => res.status(405).send("Method Not Allowed");

// ========================
//   HTML Form Routes
// ========================
app
  .route("/RegisterForm.html")
  .get((req, res) => {
    if (fs.existsSync(registerPath)) res.sendFile(registerPath);
    else res.status(404).send("RegisterForm.html not found");
  })
  .all(methodNotAllowed);

app
  .route("/SearchForm.html")
  .get((req, res) => {
    if (fs.existsSync(searchPath)) res.sendFile(searchPath);
    else res.status(404).send("SearchForm.html not found");
  })
  .all(methodNotAllowed);

// ========================
//   INVENTORY ROUTES
// ========================

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     requestBody:
 *       required: true
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
 *         description: Bad Request
 */
app
  .route("/register")
  .post(upload.single("photo"), (req, res) => { //middleware від бібліотеки Multer.
    if (!req.body.inventory_name) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).send("Inventory name is required");
    }

    const newItem = {
      id: nextId++,
      inventory_name: req.body.inventory_name,
      description: req.body.description || "",
      photo_filename: null,
    };

    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const newFilename = `photo_${newItem.id}${ext}`;
      const newPath = path.join(photosDir, newFilename);

      try {
        fs.renameSync(req.file.path, newPath);
        newItem.photo_filename = newFilename;
      } catch (e) {
        console.error("Error moving file:", e);
        return res.status(500).send("Error saving photo");
      }
    }

    inventory.push(newItem);
    res.status(201).json({ message: "Device registered", id: newItem.id });
  })
  .all(methodNotAllowed);

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримання списку всіх речей
 *     responses:
 *       200:
 *         description: OK
 */
app
  .route("/inventory") //дозволяє об'єднати кілька методів для одного URL в одному місці.
  .get((req, res) => {
    const result = inventory.map((item) => ({
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
      photo_url: item.photo_filename
        ? `/inventory/${item.id}/photo`
        : null,
    }));
    res.status(200).json(result);
  })
  .all(methodNotAllowed); //middleware ловець всіх зайвих запитів

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримання інформації про річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 *
 *   put:
 *     summary: Оновлення імені або опису
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not Found
 *
 *   delete:
 *     summary: Видалення речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not Found
 */
app
  .route("/inventory/:id")
  .get((req, res) => {
    const item = inventory.find(
      (i) => i.id === parseInt(req.params.id)
    );
    if (!item) return res.status(404).send("Not found");
    res.json({
      ...item,
      photo_url: item.photo_filename
        ? `/inventory/${item.id}/photo`
        : null,
    });
  })
  .put((req, res) => {
    const item = inventory.find(
      (i) => i.id === parseInt(req.params.id)
    );
    if (!item) return res.status(404).send("Not found");

    if (req.body.inventory_name)
      item.inventory_name = req.body.inventory_name;
    if (req.body.description !== undefined)
      item.description = req.body.description;

    res.json({ message: "Updated", item });
  })
  .delete((req, res) => {
    const id = parseInt(req.params.id);
    const index = inventory.findIndex((i) => i.id === id);

    if (index === -1) return res.status(404).send("Not found");

    const item = inventory[index];
    if (item.photo_filename) {
      try {
        fs.unlinkSync(path.join(photosDir, item.photo_filename));
      } catch (e) {}
    }

    inventory.splice(index, 1);
    res.json({ message: "Deleted" });
  })
  .all(methodNotAllowed);

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Image found
 *       404:
 *         description: Not Found
 *
 *   put:
 *     summary: Оновлення фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *       200:
 *         description: Photo updated
 *       404:
 *         description: Not Found
 */
app
  .route("/inventory/:id/photo")
  .get((req, res) => {
    const item = inventory.find(
      (i) => i.id === parseInt(req.params.id)
    );
    if (!item || !item.photo_filename)
      return res.status(404).send("Not found");

    const filePath = path.join(photosDir, item.photo_filename);
    if (!fs.existsSync(filePath))
      return res.status(404).send("Not found");

    res.sendFile(filePath);
  })
  .put(upload.single("photo"), (req, res) => {
    const item = inventory.find(
      (i) => i.id === parseInt(req.params.id)
    );
    if (!item) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).send("Not found");
    }
    if (!req.file) return res.status(400).send("No file uploaded");

    if (item.photo_filename) {
      try {
        fs.unlinkSync(path.join(photosDir, item.photo_filename));
      } catch (e) {}
    }

    const newFilename = `photo_${item.id}${path.extname(
      req.file.originalname
    )}`;

    try {
      fs.renameSync(
        req.file.path,
        path.join(photosDir, newFilename)
      );
      item.photo_filename = newFilename;
      res.json({ message: "Photo updated" });
    } catch (e) {
      console.error(e);
      res.status(500).send("Error saving file");
    }
  })
  .all(methodNotAllowed);

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук пристрою
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               has_photo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Found
 *       404:
 *         description: Not Found
 */
app
  .route("/search")
  .post((req, res) => {
    const id = parseInt(req.body.id);
    const hasPhoto =
      req.body.has_photo === "true" ||
      req.body.has_photo === "on";

    if (isNaN(id)) return res.status(400).send("Invalid ID format");

    const item = inventory.find((i) => i.id === id);
    if (!item) return res.status(404).send("Not found");

    const responseItem = { ...item };
    if (hasPhoto && item.photo_filename) {
      responseItem.description += ` (Photo link: http://${HOST}:${PORT}/inventory/${item.id}/photo)`;
    }

    res.json(responseItem);
  })
  .all(methodNotAllowed);

// ========================
//   START SERVER
// ========================
app.listen(PORT, HOST, () => {
  console.log(`=========================================`);
  console.log(`Сервер запущено на http://${HOST}:${PORT}`);
  console.log(`Swagger Docs:      http://${HOST}:${PORT}/api-docs`);
  console.log(`Register Form:     http://${HOST}:${PORT}/RegisterForm.html`);
  console.log(`Search Form:       http://${HOST}:${PORT}/SearchForm.html`);
  console.log(`=========================================`);
});
