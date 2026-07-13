const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const RAW_DIR = path.join(__dirname, "data", "raw");
const CATALOG_PATH = path.join(__dirname, "data", "processed", "catalog.json");
const PREPARE_DATA_SCRIPT = path.join(__dirname, "scripts", "prepare_data.py");
const USER_CATALOG_PATH = path.join(__dirname, "data", "user", "catalog-edits.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};


function getLatestRawMtime() {
  if (!fs.existsSync(RAW_DIR)) return 0;
  return fs.readdirSync(RAW_DIR)
    .filter((filename) => filename.endsWith(".json") || filename.endsWith(".txt"))
    .map((filename) => fs.statSync(path.join(RAW_DIR, filename)).mtimeMs)
    .reduce((latest, mtime) => Math.max(latest, mtime), 0);
}

function ensureCatalogFresh() {
  const catalogMtime = fs.existsSync(CATALOG_PATH) ? fs.statSync(CATALOG_PATH).mtimeMs : 0;
  if (catalogMtime >= getLatestRawMtime()) return;

  const pythonCommand = process.env.PYTHON || "python";
  const result = spawnSync(pythonCommand, [PREPARE_DATA_SCRIPT], {
    cwd: __dirname,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const details = result.stderr || result.stdout || "Unknown prepare-data error";
    throw new Error(`Could not regenerate catalog: ${details}`);
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function readRequestBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 10 * 1024 * 1024) req.destroy();
  });
  req.on("end", () => callback(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/catalog.json") {
    try {
      ensureCatalogFresh();
      sendFile(res, CATALOG_PATH);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/user-catalog.json") {
    if (req.method === "GET") {
      fs.readFile(USER_CATALOG_PATH, "utf8", (err, data) => {
        if (err) {
          sendJson(res, 200, { fibCatalog: null, customCatalog: null });
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(data);
      });
      return;
    }

    if (req.method === "PUT") {
      readRequestBody(req, (body) => {
        try {
          const parsed = JSON.parse(body || "{}");
          fs.mkdirSync(path.dirname(USER_CATALOG_PATH), { recursive: true });
          fs.writeFileSync(USER_CATALOG_PATH, JSON.stringify(parsed, null, 2), "utf8");
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        }
      });
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  let requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Timetable Viewer and Optimizator running on http://localhost:${PORT}`);
});