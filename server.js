// Zero-dependency backend: serves the static app + a daily leaderboard API.
// Run: node server.js  (defaults to port 8080)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const SCORES_FILE = path.join(ROOT, "scores.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}
function saveScores(data) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));
}

function sendJSON(res, code, obj, cors) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  // ---- API ----
  if (pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (pathname === "/api/leaderboard" && req.method === "GET") {
      const date = url.searchParams.get("date") || "";
      const scores = loadScores();
      const list = (scores[date] || []).slice();
      list.sort((a, b) => a.timeMs - b.timeMs);
      return sendJSON(res, 200, { date, scores: list.slice(0, 50) });
    }

    if (pathname === "/api/score" && req.method === "POST") {
      const body = await readBody(req);
      const date = String(body.date || "").slice(0, 12);
      const name = String(body.name || "Anon").slice(0, 24).trim() || "Anon";
      const timeMs = Math.max(0, Math.min(100000000, Number(body.timeMs) || 0));
      const difficulty = String(body.difficulty || "medium").slice(0, 12);
      if (!date) return sendJSON(res, 400, { error: "missing date" });
      const scores = loadScores();
      scores[date] = scores[date] || [];
      scores[date].push({
        name,
        timeMs,
        difficulty,
        ts: Date.now(),
      });
      saveScores(scores);
      return sendJSON(res, 200, { ok: true });
    }

    return sendJSON(res, 404, { error: "not found" });
  }

  // ---- Static files ----
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const full = path.join(ROOT, filePath);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      // SPA-ish fallback to index.html
      fs.readFile(path.join(ROOT, "index.html"), (e2, d2) => {
        if (e2) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(d2);
      });
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("AI Sudoku server on http://localhost:" + PORT);
});
